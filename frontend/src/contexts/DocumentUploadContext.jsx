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
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import api from '@/lib/api.js';
import { toast } from 'sonner';

const Ctx = createContext(null);

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

function uploadFailureMessage(fileName, err) {
  if (isLikelyClientSideBlock(err)) {
    return `"${fileName}" was interrupted before a response came back -- likely a brief network hiccup, an antivirus/firewall, or a browser extension. Hit Retry.`;
  }
  return extractErrorMessage(err, `Failed to upload "${fileName}"`);
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const MAX_CONCURRENT_UPLOADS = 3;

export function DocumentUploadProvider({ children }) {
  // Every queued/uploading/done/error item across ALL clients, newest last.
  // Shape: { id, name, status, errorMsg, file, folderId, portalUserId,
  //          clientId, clientName, size, addedAt, finishedAt }
  const [items, setItems] = useState([]);
  const folderIdCacheRef = useRef(new Map()); // per-(portalUser+folder) subfolder-path cache

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)));
  }, []);

  // Resolves (creating as needed) the Drive folder a dropped file's
  // relative path points to. Guards against duplicate folder creation when
  // many files share a path by caching the in-flight Promise.
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

  const uploadOne = useCallback(async (file, itemId, { portalUserId, folderId, isRetry = false, onDone } = {}) => {
    const form = new FormData();
    form.append('portal_user_id', portalUserId);
    if (folderId) form.append('folder_id', folderId);
    form.append('file', file);

    updateItem(itemId, { status: 'uploading', file, folderId, errorMsg: null });

    try {
      await api.post('/client-portal/drive/upload-file', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateItem(itemId, { status: 'done', finishedAt: Date.now() });
      onDone?.();
    } catch (err) {
      if (!isRetry && isLikelyClientSideBlock(err)) {
        await sleep(1200);
        return uploadOne(file, itemId, { portalUserId, folderId, isRetry: true, onDone });
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

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.status === 'queued' || it.status === 'uploading'));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const value = {
    items,
    queueUploads,
    retryItem,
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
