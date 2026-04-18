export const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s@.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Strip Indian business/legal suffixes so "ABC Pvt Ltd" and "ABC Private Limited"
 * compare as "abc" vs "abc" rather than failing on suffix differences.
 */
export const normEntity = (s) =>
  norm(s)
    .replace(
      /\b(pvt|private|ltd|limited|llp|inc|corp|co|and|&|the|mr|mrs|ms|dr|prof|shri|smt|firm|enterprises?|solutions?|services?|associates?|consultants?|group|india|technologies?|tech|systems?|trading|traders?|industries|international|global|national|infotech|infocomm)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

/** Strips whitespace and uppercases — for PAN, GSTIN, serial numbers */
export const normId = (s) => (s || '').replace(/\s/g, '').toUpperCase();

/** Phone: extract last 10 digits only */
const normPhone = (s) => (s || '').replace(/\D/g, '').slice(-10);

/** Jaccard similarity on word tokens (bag-of-words overlap ratio) */
export const jaccardSim = (a, b, minLen = 2) => {
  const wa = new Set(norm(a).split(' ').filter((w) => w.length >= minLen));
  const wb = new Set(norm(b).split(' ').filter((w) => w.length >= minLen));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  wa.forEach((w) => { if (wb.has(w)) inter++; });
  return inter / (wa.size + wb.size - inter);
};

/** Trigram similarity — better for typos and partial string matches */
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

/** Levenshtein edit distance for short strings (usernames, IDs) */
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

/** Normalised edit similarity 0–1 */
export const editSim = (a, b) => {
  const maxLen = Math.max((a || '').length, (b || '').length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
};

/** Best of jaccard + trigram for a given pair of strings */
const bestSim = (a, b) => Math.max(jaccardSim(a, b), trigramSim(a, b));

/** Best of jaccard + trigram on entity-normalised strings */
const bestEntitySim = (a, b) =>
  Math.max(
    jaccardSim(normEntity(a), normEntity(b)),
    trigramSim(normEntity(a), normEntity(b))
  );

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC DUPLICATE GROUPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Groups items that score above threshold with each other.
 * Uses union-find style: once an item is in a group it is "used" and
 * cannot seed another group (prevents double-counting).
 *
 * @param {Array}    items         — full data array
 * @param {Function} scoreAndReason — (a, b) => { score, reasons[], exact }
 * @param {number}   threshold     — minimum score (0–100) to flag
 * @returns {Array}  groups
 */
export const groupDuplicates = (items, scoreAndReason, threshold) => {
  const used = new Set();
  const groups = [];

  items.forEach((a, i) => {
    if (used.has(a.id)) return;
    const group  = [a.id];
    const allR   = [];

    items.forEach((b, j) => {
      if (i === j || used.has(b.id)) return;
      const { score, reasons, exact } = scoreAndReason(a, b);
      if (!exact && score < threshold) return;
      group.push(b.id);
      allR.push({ id: b.id, score: Math.round(score), reasons, exact });
    });

    if (group.length > 1) {
      const hasHigh   = allR.some((r) => r.exact || r.score >= 70);
      const confidence = hasHigh ? 'high' : 'medium';
      const topReason  = allR[0]?.reasons?.join(' · ') || 'Similar records detected';
      groups.push({
        item_ids:   group.map(String),
        confidence,
        reason:     topReason,
        score:      Math.max(...allR.map((r) => r.score)),
        source:     'local',
      });
      group.forEach((id) => used.add(id));
    }
  });

  return groups;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * TRUE DUPLICATE DEFINITION FOR CLIENTS
 * ───────────────────────────────────────
 * A client is a duplicate only when it represents the SAME legal business entity
 * entered more than once.
 *
 * HARD RULE — name is the gate:
 *   Different companies can share a CA's phone number, a shared email, or even
 *   a common accountant's PAN. Shared contact details alone NEVER qualify.
 *   Name similarity ≥ 70% (after stripping legal suffixes) is required first.
 *
 * EXCEPTION — legal IDs bypass the name gate:
 *   GSTIN and PAN are legally unique to one entity in India. If two records
 *   share the same valid GSTIN (15 chars) or PAN (10 chars), they ARE the same
 *   entity regardless of how the name was typed.
 *
 * CORROBORATION (after name gate passes):
 *   At least one of email / phone / city+state combo must corroborate.
 *   Name alone at 70–80% similarity is borderline — we need confirmation.
 *
 * THRESHOLD: 70
 */
export const detectClientDuplicates = (clients) =>
  groupDuplicates(
    clients,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── Legal ID gate (bypasses everything — legally same entity) ──────────
      const gA = normId(a.gstin || '');
      const gB = normId(b.gstin || '');
      if (gA.length === 15 && gB.length === 15 && gA === gB) {
        return { score: 98, reasons: ['Identical GSTIN — legally same entity'], exact: true };
      }

      const pA = normId(a.pan || '');
      const pB = normId(b.pan || '');
      if (pA.length === 10 && pB.length === 10 && pA === pB) {
        return { score: 93, reasons: ['Identical PAN — legally same entity'], exact: true };
      }

      // ── Name gate — must pass before any other field contributes ───────────
      const rawNameA = a.company_name || a.name || '';
      const rawNameB = b.company_name || b.name || '';
      if (!rawNameA.trim() || !rawNameB.trim()) return { score: 0, reasons: [], exact: false };

      const exactNameRaw  = norm(rawNameA) === norm(rawNameB);
      const nameSim       = bestEntitySim(rawNameA, rawNameB);

      // Hard stop: name similarity < 70% and names not exact → not a duplicate
      if (!exactNameRaw && nameSim < 0.70) {
        return { score: 0, reasons: [], exact: false };
      }

      if (exactNameRaw) {
        score += 70;
        reasons.push('Exact company name');
      } else if (nameSim >= 0.88) {
        score += 62;
        reasons.push(`Company name ${Math.round(nameSim * 100)}% similar`);
      } else if (nameSim >= 0.78) {
        score += 48;
        reasons.push(`Company name ${Math.round(nameSim * 100)}% similar — needs corroboration`);
      } else {
        // 0.70–0.78: borderline — needs TWO corroborating fields to cross threshold
        score += 28;
        reasons.push(`Company name loosely similar (${Math.round(nameSim * 100)}%)`);
      }

      // ── Corroborating fields ───────────────────────────────────────────────
      const eA = norm(a.email || '');
      const eB = norm(b.email || '');
      if (eA && eB && eA === eB) {
        score += 22;
        reasons.push('Same email address');
      }

      const phA = normPhone(a.phone || '');
      const phB = normPhone(b.phone || '');
      if (phA.length === 10 && phA === phB) {
        score += 18;
        reasons.push('Same phone number');
      }

      // City + state together (weak individually, meaningful together)
      const sameCity  = a.city  && b.city  && norm(a.city)  === norm(b.city);
      const sameState = a.state && b.state && norm(a.state) === norm(b.state);
      if (sameCity && sameState) {
        score += 7;
        reasons.push(`Same city & state (${a.city}, ${a.state})`);
      } else if (sameCity) {
        score += 3;
        reasons.push(`Same city (${a.city})`);
      }

      // Same client type (minor corroboration)
      if (a.client_type && b.client_type && a.client_type === b.client_type) {
        score += 4;
        reasons.push(`Same type (${a.client_type})`);
      }

      return { score, reasons, exact: exactNameRaw };
    },
    70  // Must have strong name similarity + at least one corroborating field
  );

// ═══════════════════════════════════════════════════════════════════════════════
// PASSWORD VAULT
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * TRUE DUPLICATE DEFINITION FOR PASSWORDS
 * ─────────────────────────────────────────
 * A password entry is a duplicate only when the SAME credential (same login)
 * for the SAME portal has been saved more than once for the SAME client.
 *
 * A company legitimately has:
 *   - GST Portal login (portal_type = GST)
 *   - DGFT Portal login (portal_type = DGFT)
 *   - MCA login        (portal_type = MCA)
 *   - Income Tax login (portal_type = INCOME_TAX)
 *   ...all for the same company. These are NOT duplicates.
 *
 * THREE HARD GATES — all three must pass:
 *   Gate 1: portal_type must be the SAME after canonicalization
 *           (MCA ≡ ROC, TDS ≡ TRACES — same underlying government portal)
 *   Gate 2: client/company name must be ≥ 65% similar
 *   Gate 3: username / login ID must match or be ≥ 90% similar
 *           (a one-character typo in username = likely same credential)
 *
 * If ANY gate fails → score = 0, not a duplicate.
 *
 * THRESHOLD: 78 (very high — all three gates + bonus signals needed)
 */

/**
 * Canonical portal groups: portals that are the same government system
 * despite different labels. Within a group, portal_type is treated as equal.
 */
const PORTAL_CANON = {
  MCA:          'mca_roc',
  ROC:          'mca_roc',
  TDS:          'tds_traces',
  TRACES:       'tds_traces',
  GST:          'gst',
  INCOME_TAX:   'income_tax',
  DGFT:         'dgft',
  TRADEMARK:    'trademark',
  EPFO:         'epfo',
  ESIC:         'esic',
  MSME:         'msme',
  RERA:         'rera',
  OTHER:        'other',
};

const canonPortal = (pt) =>
  PORTAL_CANON[(pt || '').toString().trim().toUpperCase()] ||
  norm(pt || '');

export const detectPasswordDuplicates = (entries) =>
  groupDuplicates(
    entries,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── Gate 1: Portal type must be canonically the same ──────────────────
      const cpA = canonPortal(a.portal_type);
      const cpB = canonPortal(b.portal_type);

      if (!cpA || !cpB) return { score: 0, reasons: [], exact: false };

      // 'other' portals with different portal_name = different service
      if (cpA !== cpB) {
        // Completely different government portal → cannot be same credential
        return { score: 0, reasons: [], exact: false };
      }

      // For 'other' type: also require portal_name to be similar
      if (cpA === 'other' && cpB === 'other') {
        const pnA = a.portal_name || '';
        const pnB = b.portal_name || '';
        if (pnA && pnB && bestSim(pnA, pnB) < 0.65) {
          // Same 'OTHER' category but different portal names = different sites
          return { score: 0, reasons: [], exact: false };
        }
      }

      score += 20;
      reasons.push(`Same portal type (${a.portal_type})`);

      // ── Gate 2: Client name must be similar ───────────────────────────────
      const rawCA = a.client_name || a.company_name || '';
      const rawCB = b.client_name || b.company_name || '';
      if (!rawCA.trim() || !rawCB.trim()) return { score: 0, reasons: [], exact: false };

      const exactClient = norm(rawCA) === norm(rawCB);
      const clientSim   = bestEntitySim(rawCA, rawCB);

      if (!exactClient && clientSim < 0.65) {
        // Different client — not a duplicate
        return { score: 0, reasons: [], exact: false };
      }

      if (exactClient) {
        score += 38; reasons.push('Same client');
      } else {
        score += Math.round(clientSim * 30);
        reasons.push(`Client name ${Math.round(clientSim * 100)}% similar`);
      }

      // ── Gate 3: Username / login ID must match ────────────────────────────
      const uA = norm(a.username || a.user_id || a.login_id || '');
      const uB = norm(b.username || b.user_id || b.login_id || '');

      if (!uA || !uB) {
        // No username stored — require PAN + portal + exact client as fallback
        const pA2 = normId(a.pan || '');
        const pB2 = normId(b.pan || '');
        const panMatch = pA2.length === 10 && pB2.length === 10 && pA2 === pB2;
        if (panMatch && exactClient) {
          score += 42;
          reasons.push('Same PAN + same client + same portal (no username stored)');
          return { score, reasons, exact: true };
        }
        // Insufficient data to confirm — do not flag
        return { score: 0, reasons: [], exact: false };
      }

      const exactUser = uA === uB;
      const userSim   = editSim(uA, uB);

      if (exactUser) {
        score += 42; reasons.push('Identical username / login ID');
      } else if (userSim >= 0.90) {
        // Very close — likely a typo in the same credential
        score += Math.round(userSim * 35);
        reasons.push(`Username ${Math.round(userSim * 100)}% similar (likely same login)`);
      } else {
        // Username too different — different credentials, not a duplicate
        return { score: 0, reasons: [], exact: false };
      }

      // ── Bonus signals (score boosters, not gates) ─────────────────────────
      const pA = normId(a.pan || '');
      const pB = normId(b.pan || '');
      if (pA.length === 10 && pB.length === 10 && pA === pB) {
        score += 15; reasons.push('Identical PAN');
      }

      // Same portal_name (the descriptive label user entered, e.g. "GST Portal - ABC Ltd")
      if (a.portal_name && b.portal_name) {
        const pnSim = bestSim(a.portal_name, b.portal_name);
        if (pnSim >= 0.80) {
          score += 8; reasons.push(`Portal name ${Math.round(pnSim * 100)}% similar`);
        }
      }

      const dA = norm(a.department || '');
      const dB = norm(b.department || '');
      if (dA && dB && dA === dB) {
        score += 5; reasons.push(`Same department (${a.department})`);
      }

      const exact = exactClient && exactUser && cpA === cpB;
      return { score, reasons, exact };
    },
    78  // Very high — all three gates + bonus signals must align
  );

// ═══════════════════════════════════════════════════════════════════════════════
// DSC REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * TRUE DUPLICATE DEFINITION FOR DSC
 * ───────────────────────────────────
 * A DSC record is a duplicate only when the SAME physical DSC token (or the
 * same certificate) has been entered more than once.
 *
 * HARD BLOCKERS — if ANY of these differ, it is NOT a duplicate:
 *   1. dsc_type mismatch:  "Class 3" ≠ "Organisation" — these are completely
 *      different certificate types issued by different authorities for different
 *      purposes. A person can legitimately hold both.
 *   2. dsc_class mismatch: Class 2 ≠ Class 3 — different assurance levels.
 *
 * DEFINITIVE MATCH — if ANY of these match (after type/class gate passes):
 *   • Serial number exact match → same physical token
 *   • PAN exact match → same legal holder (PAN is unique per person/entity)
 *
 * STRONG MATCH (no definitive ID, use holder name + corroboration):
 *   • Holder name ≥ 75% similar AND (same email OR same mobile OR exact expiry)
 *
 * THRESHOLD: 65
 */

/**
 * Canonicalise DSC type strings so free-text variations compare correctly.
 * Users may type: "Class 3", "CLASS 3", "class3", "Class-3" → canon: "class3"
 *                 "Organisation", "organization", "org" → canon: "organisation"
 *                 "Signature", "Digital Signature" → canon: "signature"
 *                 "Encryption" → canon: "encryption"
 */
const canonDscType = (t) => {
  const s = norm(t || '').replace(/[-\s]/g, '');
  if (/class\s*3|class3/.test(s))            return 'class3';
  if (/class\s*2|class2/.test(s))            return 'class2';
  if (/class\s*1|class1/.test(s))            return 'class1';
  if (/organ/.test(s))                        return 'organisation';
  if (/encry/.test(s))                        return 'encryption';
  if (/sign/.test(s))                         return 'signature';
  if (/individual|personal/.test(s))          return 'individual';
  return s || null;
};

export const detectDscDuplicates = (dscs) =>
  groupDuplicates(
    dscs,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── Hard blocker 1: DSC type must match ───────────────────────────────
      const ctA = canonDscType(a.dsc_type);
      const ctB = canonDscType(b.dsc_type);
      if (ctA && ctB && ctA !== ctB) {
        // "Class 3" vs "Organisation" are different certificates — hard stop
        return { score: 0, reasons: [], exact: false };
      }

      // ── Hard blocker 2: DSC class must match ──────────────────────────────
      const clA = norm(a.dsc_class || '');
      const clB = norm(b.dsc_class || '');
      if (clA && clB && clA !== clB) {
        // Class 2 vs Class 3 are different security levels — hard stop
        return { score: 0, reasons: [], exact: false };
      }

      // ── Definitive identifiers ────────────────────────────────────────────
      const sA = normId(a.serial_number || '');
      const sB = normId(b.serial_number || '');
      if (sA.length > 4 && sB.length > 4 && sA === sB) {
        const r = ['Identical serial number (same physical token)'];
        if (ctA) r.push(`Same DSC type (${a.dsc_type})`);
        return { score: 97, reasons: r, exact: true };
      }

      const pA = normId(a.pan || '');
      const pB = normId(b.pan || '');
      if (pA.length === 10 && pB.length === 10 && pA === pB) {
        const r = ['Identical PAN — same certificate holder'];
        if (ctA) r.push(`Same DSC type (${a.dsc_type})`);
        if (clA) r.push(`Same class (${a.dsc_class})`);
        return { score: 90, reasons: r, exact: true };
      }

      // ── Holder name gate — must be ≥ 75% similar ─────────────────────────
      const rawHA = a.holder_name || '';
      const rawHB = b.holder_name || '';
      if (!rawHA.trim() || !rawHB.trim()) return { score: 0, reasons: [], exact: false };

      const exactHolder = norm(rawHA) === norm(rawHB);
      const holderSim   = bestEntitySim(rawHA, rawHB);

      if (!exactHolder && holderSim < 0.75) {
        // Holder names too different — cannot be same certificate
        return { score: 0, reasons: [], exact: false };
      }

      if (exactHolder) {
        score += 55; reasons.push('Exact holder name');
      } else {
        score += Math.round(holderSim * 48);
        reasons.push(`Holder name ${Math.round(holderSim * 100)}% similar`);
      }

      // Add type/class to score now that name is confirmed similar
      if (ctA && ctB && ctA === ctB) { score += 10; reasons.push(`Same DSC type (${a.dsc_type})`); }
      if (clA && clB && clA === clB) { score += 8;  reasons.push(`Same DSC class (${a.dsc_class})`); }

      // ── Corroborating fields ───────────────────────────────────────────────
      const eA = norm(a.email || '');
      const eB = norm(b.email || '');
      if (eA && eB && eA === eB) { score += 28; reasons.push('Identical email'); }

      const mA = normPhone(a.mobile || a.phone || '');
      const mB = normPhone(b.mobile || b.phone || '');
      if (mA.length === 10 && mA === mB) { score += 18; reasons.push('Same mobile'); }

      // Identical expiry = strong signal of same DSC issued on same day
      if (a.expiry_date && b.expiry_date) {
        const dA2 = new Date(a.expiry_date).toDateString();
        const dB2 = new Date(b.expiry_date).toDateString();
        if (dA2 === dB2) { score += 15; reasons.push('Identical expiry date'); }
      }

      // Associated entity
      if (a.associated_with && b.associated_with) {
        const assocSim = bestEntitySim(a.associated_with, b.associated_with);
        if (assocSim >= 0.75) { score += 8; reasons.push(`Associated entity ${Math.round(assocSim * 100)}% similar`); }
      }

      const exact = exactHolder && eA && eB && eA === eB && ctA === ctB;
      return { score, reasons, exact };
    },
    65  // Holder name (strong) + at least one corroborating field required
  );

// ═══════════════════════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * TRUE DUPLICATE DEFINITION FOR TASKS
 * ─────────────────────────────────────
 * A task is a duplicate only when the SAME piece of work has been created more
 * than once in the system for the same client and the same team member.
 *
 * WHY TITLE ALONE IS NOT ENOUGH:
 *   "Trademark Application" is a common task title — there will be hundreds of
 *   them across different clients, assignees, and time periods. None of those
 *   are duplicates of each other.
 *
 * REQUIRED COMBINATION for a true task duplicate:
 *   (A) Title similarity ≥ 70%     [the work description]
 *   AND
 *   (B) Same department/service    [the same area of work]
 *   AND
 *   (C) Same assignee              [the same person doing it]
 *   AND
 *   (D) Same client OR notes ≥ 50% similar [the same subject matter]
 *
 *   If (A)+(B)+(C) all match but (D) doesn't → POSSIBLE duplicate, low score.
 *   If (A)+(B)+(C)+(D) all match → HIGH confidence duplicate.
 *
 * THRESHOLD: 75
 */
export const detectTodoDuplicates = (todos) =>
  groupDuplicates(
    todos,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── (A) Title similarity — must be ≥ 70% ─────────────────────────────
      const titleSim  = jaccardSim(a.title, b.title);
      const titleTri  = trigramSim(a.title, b.title);
      const titleBest = Math.max(titleSim, titleTri);
      const exactTitle = norm(a.title || '') === norm(b.title || '');

      if (exactTitle) {
        score += 35; reasons.push('Exact title match');
      } else if (titleBest >= 0.80) {
        score += Math.round(titleBest * 32); reasons.push(`Title ${Math.round(titleBest * 100)}% similar`);
      } else if (titleBest >= 0.70) {
        score += Math.round(titleBest * 24); reasons.push(`Title ${Math.round(titleBest * 100)}% similar`);
      } else {
        // Title not similar enough — not a duplicate regardless of other fields
        return { score: 0, reasons: [], exact: false };
      }

      // ── (B) Department / service must match ───────────────────────────────
      const deptA = norm(a.department || a.service || a.category || '');
      const deptB = norm(b.department || b.service || b.category || '');

      if (!deptA || !deptB || deptA !== deptB) {
        // Different departments = different work areas = NOT a duplicate
        // (e.g. "Trademark Application" in GST dept vs Trademark dept are different)
        return { score: 0, reasons: [], exact: false };
      }
      score += 22; reasons.push(`Same department (${a.department || a.service || a.category})`);

      // ── (C) Same assignee ─────────────────────────────────────────────────
      const assigneeA = norm(a.assigned_to || String(a.user_id || ''));
      const assigneeB = norm(b.assigned_to || String(b.user_id || ''));
      const sameAssignee = assigneeA && assigneeB && assigneeA === assigneeB;

      if (!sameAssignee) {
        // Different people doing same-titled work in same dept is coordination, not duplication
        return { score: 0, reasons: [], exact: false };
      }
      score += 20; reasons.push('Same assignee');

      // ── (D) Client OR notes must corroborate ──────────────────────────────
      let dCorroborated = false;

      // Client name match
      const clientA = normEntity(a.client_name || a.associated_with || a.client || '');
      const clientB = normEntity(b.client_name || b.associated_with || b.client || '');
      if (clientA && clientB) {
        const cSim = bestSim(clientA, clientB);
        if (cSim >= 0.65) {
          score += Math.round(cSim * 18);
          reasons.push(`Same client (${Math.round(cSim * 100)}% similar)`);
          dCorroborated = true;
        }
      }

      // Notes / description overlap
      const notesA = (a.notes || a.description || '').trim();
      const notesB = (b.notes || b.description || '').trim();
      if (notesA && notesB) {
        const nSim = jaccardSim(notesA, notesB);
        if (nSim >= 0.50) {
          score += Math.round(nSim * 15);
          reasons.push(`Notes ${Math.round(nSim * 100)}% similar`);
          dCorroborated = true;
        }
      }

      // If neither client nor notes corroborated → cap score below threshold
      if (!dCorroborated) {
        // Title + dept + assignee match but we can't confirm same work subject
        // Cap at 70 which is below the 75 threshold — won't be flagged
        score = Math.min(score, 70);
      }

      // ── Minor bonus signals ───────────────────────────────────────────────
      const sameDate =
        a.due_date && b.due_date &&
        new Date(a.due_date).toDateString() === new Date(b.due_date).toDateString();
      if (sameDate) { score += 6; reasons.push('Same due date'); }

      if (a.priority && b.priority && norm(a.priority) === norm(b.priority)) {
        score += 4; reasons.push(`Same priority (${a.priority})`);
      }

      const exact = exactTitle && sameAssignee && deptA === deptB && dCorroborated;
      return { score, reasons, exact };
    },
    75  // Title + dept + assignee + (client or notes) all required
  );

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENTS REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * TRUE DUPLICATE DEFINITION FOR DOCUMENTS
 * ─────────────────────────────────────────
 * A document record is a duplicate only when the SAME physical document has
 * been registered more than once.
 *
 * DEFINITIVE: document number / reference number exact match
 * DEFINITIVE: PAN + same document type (identity documents are PAN-unique)
 * STRONG: holder name (≥80%) + same document type + same associated entity
 *
 * THRESHOLD: 60
 */
export const detectDocumentDuplicates = (docs) =>
  groupDuplicates(
    docs,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── Definitive: document number ───────────────────────────────────────
      const dnA = normId(a.document_number || a.reference_no || '');
      const dnB = normId(b.document_number || b.reference_no || '');
      if (dnA.length > 3 && dnB.length > 3 && dnA === dnB) {
        return { score: 95, reasons: ['Identical document number — same document'], exact: true };
      }

      // ── Definitive: PAN ───────────────────────────────────────────────────
      const pA = normId(a.pan || '');
      const pB = normId(b.pan || '');
      if (pA.length === 10 && pB.length === 10 && pA === pB) {
        const sameType = a.document_type && b.document_type &&
          norm(a.document_type) === norm(b.document_type);
        if (sameType) {
          return { score: 88, reasons: ['Same PAN + same document type'], exact: true };
        }
        score += 55; reasons.push('Identical PAN');
      }

      // ── Holder name gate ─────────────────────────────────────────────────
      const holderA = normEntity(a.holder_name || '');
      const holderB = normEntity(b.holder_name || '');
      if (!holderA || !holderB) return { score: 0, reasons: [], exact: false };

      const exactHolder = norm(a.holder_name || '') === norm(b.holder_name || '');
      const holderSim   = bestSim(holderA, holderB);

      if (!exactHolder && holderSim < 0.80) {
        return { score: 0, reasons: [], exact: false };
      }

      if (exactHolder) { score += 48; reasons.push('Exact holder name'); }
      else { score += Math.round(holderSim * 38); reasons.push(`Holder ${Math.round(holderSim * 100)}% similar`); }

      // Document type must match — same person can have an Agreement AND an NDA
      const sameType = a.document_type && b.document_type &&
        norm(a.document_type) === norm(b.document_type);
      if (!sameType) {
        // Different document types = different documents = not a duplicate
        return { score: 0, reasons: [], exact: false };
      }
      score += 18; reasons.push(`Same document type (${a.document_type})`);

      // Associated entity
      const assocA = normEntity(a.associated_with || '');
      const assocB = normEntity(b.associated_with || '');
      if (assocA && assocB) {
        const aSim = bestSim(assocA, assocB);
        if (aSim >= 0.70) { score += 14; reasons.push('Same associated entity'); }
      }

      // Notes similarity
      if (a.notes && b.notes) {
        const nSim = jaccardSim(a.notes, b.notes);
        if (nSim >= 0.55) { score += Math.round(nSim * 10); reasons.push(`Notes ${Math.round(nSim * 100)}% similar`); }
      }

      return { score, reasons, exact: exactHolder && sameType };
    },
    60
  );
