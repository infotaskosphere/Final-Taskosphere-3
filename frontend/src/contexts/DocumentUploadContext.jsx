/**
 * DocumentUploadContext.jsx
 * ─────────────────────────────────────────────────────────────────────
 * Runs the Client Portal document-upload queue OUTSIDE the Documents tab's
 * own component tree, so uploads keep running (and their progress keeps
 * updating) even if the admin navigates to a completely different page —
 * Overview, Clients, another module entirely — while a batch is still in
 * flight. Coming back to Documents just re-subscribes to the same
 * in-progress/finished list, instead of starting from a blank tray.
 *
 * This provider must be mounted once near the app root, OUTSIDE the
 * router's route-switching area (see App.jsx) — the same pattern used by
 * MinimizedFormsContext / BulkWASenderContext.
 *
 * Concurrency: only a small, fixed number of uploads run at once
 * (MAX_CONCURRENT_UPLOADS). Uploading a whole folder of files in parallel
 * with no cap was overwhelming the backend (every request reads a whole
 * file into memory + spins up a Drive upload thread at the same instant),
 * which could crash/restart the backend process — appearing to the
 * browser as a "blocked by CORS policy" / net::ERR_FAILED error, since a
 * crashed process never gets to attach CORS headers to its response.
 *
 * Resuming a batch: this queue already survives in-app navigation because
 * it lives above the router. It CANNOT survive a full page reload/tab
 * close, because the browser does not let JS hold onto a File's bytes
 * across reloads (only its own File-picker/drag-drop gives you that). To
 * make an accidental refresh recoverable rather than confusing, we persist
 * lightweight *metadata* (name/status/size — never the file bytes) to
 * sessionStorage on every change. On reload, finished items reappear
 * marked "done" (so nobody re-drags and re-uploads them by mistake) and
 * anything still queued/uploading reappears marked "interrupted", with a
 * prompt to re-add just those files — the queue always knows what already
 * succeeded, so retries never recreate a file that made it through.
 *
 * Duplicate files: the backend checks, per file, whether a file with the
 * same name already exists in the destination Drive folder. If it does,
 * the upload is paused with status 'conflict' instead of silently creating
 * a second same-named file — the UI then asks the admin to either
 * "Overwrite" (replace the existing file's content, same Drive id) or
 * "Keep both" (upload alongside it, auto-suffixed "(1)", "(2)", …).
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import api from '@/lib/api.js';
import { toast } from 'sonner';

const Ctx = createContext(null);
const STORAGE_KEY = 'taskosphere:documentUploadQueue:v1';

function extractErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(' | ');
  return fallback;
}

// A request that got a response (even an error one, like 403/500) reached
// our server. A request with NO response at all (err.response undefined,
// err.code ERR_NETWORK / ERR_FAILED) never reached the server — almost
// always a client-side block (antivirus/firewall/extension) or the
// backend process restarting mid-request.
function isLikelyClientSideBlock(err) {
  return !err?.response;
}

function isConflictError(err) {
  return err?.response?.status === 409 && err?.response?.data?.detail?.conflict;
}

function uploadFailureMessage(fileName, err) {
  if (isLikelyClientSideBlock(err)) {
    return `"${fileName}" was interrupted before a response came back -- likely a brief network hiccup, an antivirus/firewall, or a browser extension. Hit Retry.`;
  }
  return extractErrorMessage(err, `Failed to upload "${fileName}"`);
}

// Strips the (non-serializable) File object out before writing to
// sessionStorage — we only ever persist metadata, never file bytes.
function toPersistable(items) {
  return items.map(({ file, ...rest }) => rest);
}

function loadPersisted() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything that was still queued/uploading when the page went away
    // lost its File object on reload — flag it so the UI can ask the
    // admin to re-add just those, instead of pretending it's still moving.
    return parsed.map((it) =>
      it.status === 'queued' || it.status === 'uploading'
        ? { ...it, status: 'interrupted', file: null }
        : { ...it, file: null }
    );
  } catch {
    return [];
  }
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
// Keep uploads deliberately conservative. Render instances can restart when
// several files are read/proxied to Drive at the same time; the browser then
// reports those restarts as "interrupted before a response came back".
const MAX_CONCURRENT_UPLOADS = 1;
const RETRY_DELAYS_MS = [1500, 4000, 9000, 16000];

function isRetryableUploadError(err) {
  const status = err?.response?.status;
  return !err?.response || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export function DocumentUploadProvider({ children }) {
  // Every queued/uploading/done/error/conflict/interrupted item across ALL
  // clients, newest last.
  // Shape: { id, name, status, errorMsg, file, folderId, portalUserId,
  //          clientId, clientName, size, addedAt, finishedAt, conflict }
  const [items, setItems] = useState(loadPersisted);
  const folderIdCacheRef = useRef(new Map()); // per-(portalUser+folder) subfolder-path cache

  // Persist metadata (not file bytes) on every change so a reload mid-batch
  // is recoverable instead of silently wiping the tray.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistable(items)));
    } catch {
      // sessionStorage full/unavailable — non-fatal, tray just won't survive a reload
    }
  }, [items]);

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)));
  }, []);

  // Resolves (creating as needed) the Drive folder a dropped file's
  // relative path points to. Guards against duplicate folder creation when
  // many files share a path by caching the in-flight Promise. The backend
  // already finds-or-creates by name, so this never creates a second
  // same-named folder even across separate batches.
  const resolveTargetFolder = useCallback(async (portalUserId, baseFolderId, pathParts) => {
    let parentId = baseFolderId || null;
    if (!pathParts?.length) return parentId;
    let cacheKey = `${portalUserId}:${parentId || 'root'}`;
    for (const name of pathParts) {
      cacheKey += `/${name}`;
      const cached = folderIdCacheRef.current.get(cacheKey);
      if (cached !== undefined) {
        parentId = await Promise.resolve(cached);
        continue;
      }
      const promise = api
        .post('/client-portal/drive/simple-create-folder', {
          portal_user_id: portalUserId,
          folder_name: name,
          parent_folder_id: parentId,
        })
        .then((res) => res.data.id);
      folderIdCacheRef.current.set(cacheKey, promise);
      parentId = await promise;
      folderIdCacheRef.current.set(cacheKey, parentId);
    }
    return parentId;
  }, []);

  const uploadOne = useCallback(async (file, itemId, { portalUserId, folderId, attempt = 0, conflictAction = null, onDone } = {}) => {
    const form = new FormData();
    form.append('portal_user_id', portalUserId);
    if (folderId) form.append('folder_id', folderId);
    if (conflictAction) form.append('conflict_action', conflictAction);
    form.append('file', file);

    updateItem(itemId, { status: 'uploading', file, folderId, errorMsg: null, conflict: null });

    try {
      const res = await api.post('/client-portal/drive/upload-file', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const overwritten = !!res?.data?.overwritten;
      updateItem(itemId, { status: 'done', finishedAt: Date.now(), overwritten });
      onDone?.();
    } catch (err) {
      if (isConflictError(err)) {
        const detail = err.response.data.detail;
        updateItem(itemId, {
          status: 'conflict',
          file, folderId,
          conflict: {
            existingFileId: detail.existing_file_id,
            existingModifiedTime: detail.existing_modified_time,
            message: detail.message,
          },
        });
        return;
      }
      if (attempt < RETRY_DELAYS_MS.length && isRetryableUploadError(err)) {
        updateItem(itemId, {
          status: 'queued',
          errorMsg: `Connection interrupted. Retrying automatically (${attempt + 1}/${RETRY_DELAYS_MS.length})…`,
        });
        await sleep(RETRY_DELAYS_MS[attempt]);
        return uploadOne(file, itemId, { portalUserId, folderId, attempt: attempt + 1, conflictAction, onDone });
      }
      const msg = uploadFailureMessage(file.name, err);
      updateItem(itemId, { status: 'error', errorMsg: msg, file, folderId, finishedAt: Date.now() });
      toast.error(msg);
    }
  }, [updateItem]);

  /**
   * entries: [{ file, pathParts }]
   * target:  { portalUserId, folderId (current folder being viewed), clientId, clientName }
   * onDone:  optional callback fired after each successful upload (used by
   *          the Documents tab, while mounted, to refresh its file list).
   */
  const queueUploads = useCallback((entries, target, onDone) => {
    if (!target?.portalUserId) {
      toast.error("Set up this client's Drive folder first.");
      return;
    }
    if (!entries?.length) return;

    const newItems = entries.map((e) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: e.pathParts?.length ? [...e.pathParts, e.file.name].join('/') : e.file.name,
      size: e.file.size,
      status: 'queued',
      errorMsg: null,
      conflict: null,
      file: e.file,
      pathParts: e.pathParts || [],
      folderId: target.folderId || null,
      portalUserId: target.portalUserId,
      clientId: target.clientId,
      clientName: target.clientName,
      addedAt: Date.now(),
      finishedAt: null,
    }));
    setItems((prev) => [...prev, ...newItems]);

    const processEntry = async (entry, idx) => {
      const item = newItems[idx];
      try {
        const folderId = entry.pathParts?.length
          ? await resolveTargetFolder(target.portalUserId, target.folderId, entry.pathParts)
          : (target.folderId || null);
        await uploadOne(entry.file, item.id, { portalUserId: target.portalUserId, folderId, onDone });
      } catch (err) {
        const msg = uploadFailureMessage(entry.file.name, err);
        updateItem(item.id, { status: 'error', errorMsg: msg, finishedAt: Date.now() });
        toast.error(msg);
      }
    };

    let cursor = 0;
    const runWorker = async () => {
      while (cursor < entries.length) {
        const idx = cursor++;
        await processEntry(entries[idx], idx);
      }
    };
    const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, entries.length);
    for (let i = 0; i < workerCount; i++) runWorker();
  }, [resolveTargetFolder, uploadOne, updateItem]);

  const retryItem = useCallback((item, onDone) => {
    if (!item?.file) {
      toast.error("Can't retry -- please re-drag this file in.");
      return;
    }
    updateItem(item.id, { status: 'queued', errorMsg: null });
    uploadOne(item.file, item.id, { portalUserId: item.portalUserId, folderId: item.folderId, onDone });
  }, [uploadOne, updateItem]);

  // Called when the admin answers the duplicate-file prompt for one item.
  // action: 'overwrite' | 'keep_both'
  const resolveConflict = useCallback((item, action, onDone) => {
    if (!item?.file) {
      toast.error("Can't resolve -- please re-drag this file in.");
      return;
    }
    updateItem(item.id, { status: 'uploading', conflict: null });
    uploadOne(item.file, item.id, { portalUserId: item.portalUserId, folderId: item.folderId, conflictAction: action, onDone });
  }, [uploadOne, updateItem]);

  // Applies the same choice to every currently-conflicting item in one go
  // (e.g. re-uploading a whole folder that was previously uploaded).
  //
  // Important: do not start these uploads from inside a React state updater.
  // React may invoke updaters more than once in development and that can
  // duplicate requests. Also keep the same concurrency cap used by normal
  // uploads; firing dozens of overwrite requests at once can overwhelm the
  // backend/Drive and surface as browser network/CORS-looking failures.
  const resolveAllConflicts = useCallback((action, onDone, scope = {}) => {
    const conflicts = items.filter((it) => (
      it.status === 'conflict' &&
      it.file &&
      (!scope.portalUserId || it.portalUserId === scope.portalUserId)
    ));
    if (!conflicts.length) return;

    conflicts.forEach((it) => {
      updateItem(it.id, { status: 'queued', conflict: null, errorMsg: null });
    });

    let cursor = 0;
    const runWorker = async () => {
      while (cursor < conflicts.length) {
        const it = conflicts[cursor++];
        await uploadOne(it.file, it.id, {
          portalUserId: it.portalUserId,
          folderId: it.folderId,
          conflictAction: action,
          onDone,
        });
      }
    };

    const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, conflicts.length);
    for (let i = 0; i < workerCount; i++) runWorker();
  }, [items, uploadOne, updateItem]);

  const clearFinished = useCallback((scope = {}) => {
    setItems((prev) => prev.filter((it) => {
      if (scope.portalUserId && it.portalUserId !== scope.portalUserId) return true;
      return it.status === 'queued' || it.status === 'uploading' || it.status === 'conflict';
    }));
  }, []);

  const clearAll = useCallback((scope = {}) => {
    setItems((prev) => (scope.portalUserId ? prev.filter((it) => it.portalUserId !== scope.portalUserId) : []));
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const value = {
    items,
    queueUploads,
    retryItem,
    resolveConflict,
    resolveAllConflicts,
    clearFinished,
    clearAll,
    removeItem,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDocumentUploads() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDocumentUploads must be used within a DocumentUploadProvider');
  return ctx;
}
