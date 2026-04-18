/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║           TASKOSPHERE  —  AI DUPLICATE DETECTION ENGINE                 ║
 * ║   Pure JS · Zero 3rd-party AI · Runs entirely in the browser            ║
 * ║                                                                          ║
 * ║  Algorithms:                                                             ║
 * ║   • Jaccard similarity  — bag-of-words overlap ratio                    ║
 * ║   • Trigram similarity  — character-level n-gram fingerprinting         ║
 * ║   • Levenshtein distance — edit-distance for short strings              ║
 * ║   • Phonetic normalizer — strips legal suffixes (Pvt, Ltd, LLP …)      ║
 * ║   • Weighted composite score — field-weight matrix per entity type      ║
 * ║   • Confidence bands    — HIGH / MEDIUM / LOW with human reasons        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ─── Core normalizer ─────────────────────────────────────────────────────────
export const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s@.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Strip common Indian legal/business suffixes for smarter entity matching
export const normEntity = (s) =>
  norm(s)
    .replace(
      /\b(pvt|private|ltd|limited|llp|inc|corp|co|and|&|the|mr|mrs|ms|dr|prof|shri|smt|firm|enterprises?|solutions?|services?|associates?|consultants?|group|india|technologies?|tech|systems?)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

// Normalise PAN / GSTIN / email for exact-match dedup
export const normId = (s) => (s || '').replace(/\s/g, '').toUpperCase();

// ─── Jaccard (word-token) similarity ─────────────────────────────────────────
export const jaccardSim = (a, b, minLen = 2) => {
  const wa = new Set(norm(a).split(' ').filter((w) => w.length > minLen));
  const wb = new Set(norm(b).split(' ').filter((w) => w.length > minLen));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  wa.forEach((w) => { if (wb.has(w)) inter++; });
  return inter / (wa.size + wb.size - inter);
};

// ─── Trigram (character n-gram) similarity ────────────────────────────────────
export const trigramSim = (a, b) => {
  const trig = (s) => {
    const r = new Set();
    const str = norm(s);
    for (let i = 0; i < str.length - 2; i++) r.add(str.slice(i, i + 3));
    return r;
  };
  const sa = trig(a);
  const sb = trig(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach((t) => { if (sb.has(t)) inter++; });
  return inter / (sa.size + sb.size - inter);
};

// ─── Levenshtein distance (for short strings like usernames/PIDs) ─────────────
export const levenshtein = (a, b) => {
  const s1 = norm(a);
  const s2 = norm(b);
  if (!s1) return s2.length;
  if (!s2) return s1.length;
  const dp = Array.from({ length: s1.length + 1 }, (_, i) =>
    Array.from({ length: s2.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      dp[i][j] =
        s1[i - 1] === s2[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[s1.length][s2.length];
};

// Normalised edit similarity 0-1
export const editSim = (a, b) => {
  const maxLen = Math.max((a || '').length, (b || '').length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
};

// ─── Generic duplicate grouper ────────────────────────────────────────────────
/**
 * @param {Array}    items         — full data array
 * @param {Function} scoreAndReason — (itemA, itemB) => { score:number, reasons:string[], exact:bool }
 * @param {number}   threshold     — minimum score to flag as duplicate (0-100)
 * @returns {Array}  groups         — [{ item_ids, confidence, reason, score }]
 */
export const groupDuplicates = (items, scoreAndReason, threshold = 40) => {
  const used = new Set();
  const groups = [];

  items.forEach((a, i) => {
    if (used.has(a.id)) return;
    const group = [a.id];
    const allReasons = [];

    items.forEach((b, j) => {
      if (i === j || used.has(b.id)) return;
      const { score, reasons, exact } = scoreAndReason(a, b);
      if (!exact && score < threshold) return;
      group.push(b.id);
      allReasons.push({ id: b.id, score: Math.round(score), reasons, exact });
    });

    if (group.length > 1) {
      const hasHigh = allReasons.some((r) => r.exact || r.score >= 65);
      const confidence = hasHigh ? 'high' : 'medium';
      const topReason = allReasons[0]?.reasons?.join(' · ') || 'Similar records detected';
      groups.push({
        item_ids: group.map(String),
        confidence,
        reason: topReason,
        score: Math.max(...allReasons.map((r) => r.score)),
        source: 'local',
      });
      group.forEach((id) => used.add(id));
    }
  });

  return groups;
};

// ════════════════════════════════════════════════════════════════════════════════
// DOMAIN-SPECIFIC ENGINES
// ════════════════════════════════════════════════════════════════════════════════

// ─── CLIENTS ─────────────────────────────────────────────────────────────────
export const detectClientDuplicates = (clients) => {
  return groupDuplicates(
    clients,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // 1. GSTIN — unique identifier, exact match = definite duplicate
      const gA = normId(a.gstin);
      const gB = normId(b.gstin);
      const exactGstin = gA && gB && gA === gB;
      if (exactGstin) { score += 90; reasons.push('Identical GSTIN'); }

      // 2. PAN
      const pA = normId(a.pan);
      const pB = normId(b.pan);
      const exactPan = pA && pB && pA === pB;
      if (exactPan) { score += 80; reasons.push('Identical PAN'); }

      // 3. Email
      const eA = norm(a.email);
      const eB = norm(b.email);
      const exactEmail = eA && eB && eA === eB;
      if (exactEmail) { score += 70; reasons.push('Identical email'); }

      // 4. Phone (last 10 digits)
      const phA = (a.phone || '').replace(/\D/g, '').slice(-10);
      const phB = (b.phone || '').replace(/\D/g, '').slice(-10);
      const exactPhone = phA.length >= 10 && phA === phB;
      if (exactPhone) { score += 60; reasons.push('Identical phone'); }

      // 5. Company name — three layers
      const nameSim = jaccardSim(a.company_name, b.company_name);
      const nameNormSim = trigramSim(normEntity(a.company_name), normEntity(b.company_name));
      const exactName = norm(a.company_name) === norm(b.company_name);
      if (exactName) { score += 55; reasons.push('Exact company name'); }
      else if (nameSim > 0.7) { score += nameSim * 40; reasons.push(`Company name ${Math.round(nameSim * 100)}% similar`); }
      else if (nameNormSim > 0.7) { score += nameNormSim * 25; reasons.push(`Core name ${Math.round(nameNormSim * 100)}% similar`); }

      // 6. Same type adds context
      if (a.client_type && a.client_type === b.client_type) { score += 5; reasons.push(`same type (${a.client_type})`); }

      const exact = exactGstin || exactPan || exactEmail || exactPhone || exactName;
      return { score, reasons, exact };
    },
    38
  );
};

// ─── TODOS ────────────────────────────────────────────────────────────────────
export const detectTodoDuplicates = (todos) => {
  return groupDuplicates(
    todos,
    (a, b) => {
      const reasons = [];
      let score = 0;

      const titleSim = jaccardSim(a.title, b.title);
      const titleTri = trigramSim(a.title, b.title);
      const exactTitle = norm(a.title) === norm(b.title);
      if (exactTitle) { score += 70; reasons.push('Exact title match'); }
      else if (titleSim > 0.6) { score += titleSim * 55; reasons.push(`Title ${Math.round(titleSim * 100)}% similar`); }
      else if (titleTri > 0.65) { score += titleTri * 35; reasons.push(`Title phrasing ${Math.round(titleTri * 100)}% alike`); }

      // Description similarity (if both have descriptions)
      if (a.description && b.description) {
        const descSim = jaccardSim(a.description, b.description);
        if (descSim > 0.5) { score += descSim * 20; reasons.push(`Description ${Math.round(descSim * 100)}% similar`); }
      }

      // Same due date
      const sameDate =
        a.due_date && b.due_date &&
        new Date(a.due_date).toDateString() === new Date(b.due_date).toDateString();
      if (sameDate) { score += 8; reasons.push('Same due date'); }

      // Same assignee
      const sameUser = a.user_id && b.user_id && a.user_id === b.user_id;
      if (sameUser) { score += 5; reasons.push('Same user'); }

      const exact = exactTitle;
      return { score, reasons, exact };
    },
    38
  );
};

// ─── DSC REGISTER ─────────────────────────────────────────────────────────────
export const detectDscDuplicates = (dscs) => {
  return groupDuplicates(
    dscs,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // PAN — definitive for DSC
      const pA = normId(a.pan);
      const pB = normId(b.pan);
      const exactPan = pA && pB && pA === pB;
      if (exactPan) { score += 85; reasons.push('Identical PAN'); }

      // Serial number
      const sA = normId(a.serial_number);
      const sB = normId(b.serial_number);
      const exactSerial = sA && sB && sA === sB;
      if (exactSerial) { score += 90; reasons.push('Identical serial number'); }

      // Holder name (trigram + jaccard)
      const holderSim = jaccardSim(a.holder_name, b.holder_name);
      const holderTri = trigramSim(normEntity(a.holder_name), normEntity(b.holder_name));
      const exactHolder = norm(a.holder_name) === norm(b.holder_name);
      if (exactHolder) { score += 55; reasons.push('Exact holder name'); }
      else if (holderSim > 0.65) { score += holderSim * 40; reasons.push(`Holder name ${Math.round(holderSim * 100)}% similar`); }
      else if (holderTri > 0.7) { score += holderTri * 30; reasons.push(`Holder ${Math.round(holderTri * 100)}% similar`); }

      // Email
      const eA = norm(a.email);
      const eB = norm(b.email);
      if (eA && eB && eA === eB) { score += 65; reasons.push('Identical email'); }

      // Same type + class
      if (a.dsc_type && a.dsc_type === b.dsc_type) { score += 5; reasons.push(`same type (${a.dsc_type})`); }
      if (a.dsc_class && a.dsc_class === b.dsc_class) { score += 3; reasons.push(`same class`); }

      // Expiry proximity (within 7 days)
      if (a.expiry_date && b.expiry_date) {
        const diff = Math.abs(new Date(a.expiry_date) - new Date(b.expiry_date)) / 86400000;
        if (diff <= 7) { score += 8; reasons.push('Expiry dates within 7 days'); }
      }

      const exact = exactPan || exactSerial || (exactHolder && (eA && eB && eA === eB));
      return { score, reasons, exact };
    },
    40
  );
};

// ─── DOCUMENTS REGISTER ───────────────────────────────────────────────────────
export const detectDocumentDuplicates = (docs) => {
  return groupDuplicates(
    docs,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // Document number / reference — unique identifier
      const dnA = normId(a.document_number || a.reference_no || '');
      const dnB = normId(b.document_number || b.reference_no || '');
      const exactDocNum = dnA && dnB && dnA === dnB;
      if (exactDocNum) { score += 88; reasons.push('Identical document number'); }

      // Holder name
      const holderSim = jaccardSim(a.holder_name, b.holder_name);
      const holderTri = trigramSim(normEntity(a.holder_name), normEntity(b.holder_name));
      const exactHolder = norm(a.holder_name) === norm(b.holder_name);
      if (exactHolder) { score += 52; reasons.push('Exact holder name'); }
      else if (holderSim > 0.65) { score += holderSim * 38; reasons.push(`Holder ${Math.round(holderSim * 100)}% similar`); }
      else if (holderTri > 0.7) { score += holderTri * 28; reasons.push(`Holder name ${Math.round(holderTri * 100)}% similar`); }

      // Document type match
      const sameType = a.document_type && b.document_type && norm(a.document_type) === norm(b.document_type);
      if (sameType) { score += 15; reasons.push(`same doc type (${a.document_type})`); }

      // PAN
      const pA = normId(a.pan || '');
      const pB = normId(b.pan || '');
      if (pA && pB && pA === pB) { score += 70; reasons.push('Identical PAN'); }

      // Notes similarity
      if (a.notes && b.notes) {
        const noteSim = jaccardSim(a.notes, b.notes);
        if (noteSim > 0.5) { score += noteSim * 12; reasons.push(`Notes ${Math.round(noteSim * 100)}% similar`); }
      }

      const exact = exactDocNum || (pA && pB && pA === pB && sameType);
      return { score, reasons, exact };
    },
    38
  );
};

// ─── PASSWORD VAULT ───────────────────────────────────────────────────────────
export const detectPasswordDuplicates = (entries) => {
  return groupDuplicates(
    entries,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // Portal type — same type is prerequisite for most duplicates
      const samePortal = a.portal_type && b.portal_type && norm(a.portal_type) === norm(b.portal_type);
      if (!samePortal && a.portal_type && b.portal_type) {
        // Different portal types can still be dups if same PAN/username
      }

      // Username (login ID)
      const uA = norm(a.username || a.user_id || '');
      const uB = norm(b.username || b.user_id || '');
      const exactUser = uA && uB && uA === uB;
      if (exactUser) { score += 70; reasons.push('Identical username'); }
      else if (uA && uB) {
        const uSim = editSim(uA, uB);
        if (uSim > 0.85) { score += uSim * 40; reasons.push(`Username ${Math.round(uSim * 100)}% similar`); }
      }

      // Client name
      const cA = normEntity(a.client_name || a.company_name || '');
      const cB = normEntity(b.client_name || b.company_name || '');
      const exactClient = cA && cB && cA === cB;
      if (exactClient) { score += 45; reasons.push('Same client'); }
      else if (cA && cB) {
        const cSim = jaccardSim(cA, cB);
        if (cSim > 0.6) { score += cSim * 30; reasons.push(`Client ${Math.round(cSim * 100)}% similar`); }
      }

      // Portal type bonus
      if (samePortal) { score += 12; reasons.push(`same portal (${a.portal_type})`); }

      // PAN
      const pA = normId(a.pan || '');
      const pB = normId(b.pan || '');
      if (pA && pB && pA === pB) { score += 65; reasons.push('Identical PAN'); }

      // Same department
      if (a.department && b.department && norm(a.department) === norm(b.department)) {
        score += 6; reasons.push(`same dept (${a.department})`);
      }

      // Notes / description
      if (a.notes && b.notes) {
        const nSim = jaccardSim(a.notes, b.notes);
        if (nSim > 0.55) { score += nSim * 10; reasons.push(`Notes ${Math.round(nSim * 100)}% similar`); }
      }

      const exact = exactUser && (samePortal || exactClient || (pA && pB && pA === pB));
      return { score, reasons, exact };
    },
    40
  );
};
