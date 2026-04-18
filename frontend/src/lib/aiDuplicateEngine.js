/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║           TASKOSPHERE  —  AI DUPLICATE DETECTION ENGINE  v2             ║
 * ║   Pure JS · Zero 3rd-party AI · Runs entirely in the browser            ║
 * ║                                                                          ║
 * ║  Algorithms:                                                             ║
 * ║   • Jaccard similarity  — bag-of-words overlap ratio                    ║
 * ║   • Trigram similarity  — character-level n-gram fingerprinting         ║
 * ║   • Levenshtein distance — edit-distance for short strings              ║
 * ║   • Phonetic normalizer — strips legal suffixes (Pvt, Ltd, LLP …)      ║
 * ║   • Weighted composite score — field-weight matrix per entity type      ║
 * ║   • Confidence bands    — HIGH / MEDIUM / LOW with human reasons        ║
 * ║                                                                          ║
 * ║  v2 Changes:                                                             ║
 * ║   • Clients: company name is gating primary criteria                    ║
 * ║   • Passwords: same portal+client+username required — not just client   ║
 * ║   • DSC: dsc_type mismatch is a hard blocker                            ║
 * ║   • Tasks: title alone insufficient — checks dept/assignee/notes        ║
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
/**
 * v2 Logic:
 * - Company name similarity is the GATING criterion.
 *   If name similarity is below 55%, the pair is NEVER flagged as duplicate,
 *   no matter how many other fields match.
 * - Rationale: Two different companies can share a phone number, email account,
 *   or even a CA's contact without being the same client.
 * - Hard identifiers (GSTIN / PAN) override the name gate because they are
 *   legally unique to one entity — same GSTIN = same company by definition.
 */
export const detectClientDuplicates = (clients) => {
  return groupDuplicates(
    clients,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── Hard legal identifiers (legally unique — override everything) ──────
      const gA = normId(a.gstin);
      const gB = normId(b.gstin);
      const exactGstin = gA.length >= 15 && gB.length >= 15 && gA === gB;
      if (exactGstin) { score += 95; reasons.push('Identical GSTIN (legally same entity)'); }

      const pA = normId(a.pan);
      const pB = normId(b.pan);
      const exactPan = pA.length >= 10 && pB.length >= 10 && pA === pB;
      if (exactPan) { score += 88; reasons.push('Identical PAN (legally same entity)'); }

      // If a hard ID matched, skip name gate — same legal entity regardless of name
      if (exactGstin || exactPan) {
        return { score, reasons, exact: true };
      }

      // ── Name gate — MUST pass before any soft field adds score ───────────
      // Without strong name similarity, shared phone/email means nothing
      const nameA = normEntity(a.company_name || a.name || '');
      const nameB = normEntity(b.company_name || b.name || '');
      if (!nameA || !nameB) return { score: 0, reasons: [], exact: false };

      const exactName   = norm(a.company_name || '') === norm(b.company_name || '');
      const nameTri     = trigramSim(nameA, nameB);
      const nameJaccard = jaccardSim(nameA, nameB);
      const nameScore   = Math.max(nameTri, nameJaccard);

      // Name gate: if name similarity < 0.55, not a duplicate — hard stop
      if (!exactName && nameScore < 0.55) {
        return { score: 0, reasons: [], exact: false };
      }

      if (exactName) {
        score += 65; reasons.push('Exact company name match');
      } else if (nameScore >= 0.80) {
        score += 55; reasons.push(`Company name ${Math.round(nameScore * 100)}% similar`);
      } else if (nameScore >= 0.65) {
        score += 40; reasons.push(`Company name ${Math.round(nameScore * 100)}% similar`);
      } else {
        // 0.55–0.65: borderline — needs multiple corroborating fields
        score += 20; reasons.push(`Company name loosely similar (${Math.round(nameScore * 100)}%)`);
      }

      // ── Corroborating fields (only meaningful AFTER name gate passes) ─────
      const eA = norm(a.email || '');
      const eB = norm(b.email || '');
      if (eA && eB && eA === eB) { score += 25; reasons.push('Same email address'); }

      const phA = (a.phone || '').replace(/\D/g, '').slice(-10);
      const phB = (b.phone || '').replace(/\D/g, '').slice(-10);
      if (phA.length >= 10 && phA === phB) { score += 20; reasons.push('Same phone number'); }

      if (a.city && b.city && norm(a.city) === norm(b.city)) {
        score += 5; reasons.push(`Same city (${a.city})`);
      }
      if (a.client_type && b.client_type && a.client_type === b.client_type) {
        score += 5; reasons.push(`Same type (${a.client_type})`);
      }

      return { score, reasons, exact: exactName };
    },
    55  // Higher threshold — needs meaningful name overlap to qualify
  );
};

// ─── TODOS ────────────────────────────────────────────────────────────────────
/**
 * v2 Logic:
 * - Title similarity alone is NOT enough to flag as duplicate.
 * - Tasks are work items; different people can have tasks with similar titles
 *   for completely different clients / purposes.
 * - A true duplicate must have:
 *     (a) HIGH title similarity  AND
 *     (b) at least ONE of: same assignee, same department/service, or
 *         notes content overlap
 * - If title is exact AND same assignee AND same dept → very high confidence.
 */
export const detectTodoDuplicates = (todos) => {
  return groupDuplicates(
    todos,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── Title similarity ──────────────────────────────────────────────────
      const titleSim  = jaccardSim(a.title, b.title);
      const titleTri  = trigramSim(a.title, b.title);
      const titleBest = Math.max(titleSim, titleTri);
      const exactTitle = norm(a.title) === norm(b.title);

      if (exactTitle) {
        score += 40; reasons.push('Exact title match');
      } else if (titleBest >= 0.75) {
        score += titleBest * 35; reasons.push(`Title ${Math.round(titleBest * 100)}% similar`);
      } else if (titleBest >= 0.55) {
        score += titleBest * 20; reasons.push(`Title loosely similar (${Math.round(titleBest * 100)}%)`);
      } else {
        // Titles not similar enough — never a duplicate
        return { score: 0, reasons: [], exact: false };
      }

      // ── Corroborating signals — at least one required to pass threshold ───

      // Same assignee
      const sameAssignee =
        (a.assigned_to && b.assigned_to && norm(a.assigned_to) === norm(b.assigned_to)) ||
        (a.user_id && b.user_id && String(a.user_id) === String(b.user_id));
      if (sameAssignee) { score += 25; reasons.push('Same assignee'); }

      // Same department / service
      const deptA = norm(a.department || a.service || a.category || '');
      const deptB = norm(b.department || b.service || b.category || '');
      const sameDept = deptA && deptB && deptA === deptB;
      if (sameDept) { score += 20; reasons.push(`Same dept/service (${a.department || a.service || a.category})`); }

      // Notes / description overlap
      const notesA = a.notes || a.description || '';
      const notesB = b.notes || b.description || '';
      if (notesA && notesB) {
        const notesSim = jaccardSim(notesA, notesB);
        if (notesSim >= 0.45) { score += notesSim * 25; reasons.push(`Notes ${Math.round(notesSim * 100)}% similar`); }
      }

      // Same client / associated entity
      const clientA = normEntity(a.client_name || a.associated_with || '');
      const clientB = normEntity(b.client_name || b.associated_with || '');
      if (clientA && clientB && jaccardSim(clientA, clientB) > 0.6) {
        score += 15; reasons.push('Same client / entity');
      }

      // Same due date
      const sameDate =
        a.due_date && b.due_date &&
        new Date(a.due_date).toDateString() === new Date(b.due_date).toDateString();
      if (sameDate) { score += 8; reasons.push('Same due date'); }

      // Same priority
      if (a.priority && b.priority && norm(a.priority) === norm(b.priority)) {
        score += 5; reasons.push(`Same priority (${a.priority})`);
      }

      const exact = exactTitle && sameAssignee && sameDept;
      return { score, reasons, exact };
    },
    62  // Requires title + at least one strong corroborating signal
  );
};

// ─── DSC REGISTER ─────────────────────────────────────────────────────────────
/**
 * v2 Logic:
 * - DSC type (CLASS 3 vs ORGANISATION) are entirely different certificate types
 *   issued for different purposes. A mismatch is a HARD BLOCKER.
 * - DSC class mismatch is also a hard blocker.
 * - PAN + same type = definitive duplicate (renewed/replaced DSC).
 * - Serial number exact match = definitive duplicate (literally same token).
 */
export const detectDscDuplicates = (dscs) => {
  return groupDuplicates(
    dscs,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── Hard blockers — different type/class = cannot be duplicate ────────
      const typeA = norm(a.dsc_type || '');
      const typeB = norm(b.dsc_type || '');
      if (typeA && typeB && typeA !== typeB) {
        // ORGANISATION vs CLASS 3 are fundamentally different — hard stop
        return { score: 0, reasons: [], exact: false };
      }

      const classA = norm(a.dsc_class || '');
      const classB = norm(b.dsc_class || '');
      if (classA && classB && classA !== classB) {
        // Class 2 vs Class 3 are different products — hard stop
        return { score: 0, reasons: [], exact: false };
      }

      // ── Hard identifiers ─────────────────────────────────────────────────
      const sA = normId(a.serial_number || '');
      const sB = normId(b.serial_number || '');
      const exactSerial = sA.length > 4 && sB.length > 4 && sA === sB;
      if (exactSerial) { score += 95; reasons.push('Identical serial number (same physical token)'); }

      const pA = normId(a.pan || '');
      const pB = normId(b.pan || '');
      const exactPan = pA.length >= 10 && pB.length >= 10 && pA === pB;
      if (exactPan) { score += 85; reasons.push('Identical PAN'); }

      if (exactSerial || exactPan) {
        if (typeA && typeB) { reasons.push(`Same DSC type (${a.dsc_type})`); }
        return { score, reasons, exact: true };
      }

      // ── Holder name (strong similarity needed) ────────────────────────────
      const holderSim = jaccardSim(a.holder_name, b.holder_name);
      const holderTri = trigramSim(normEntity(a.holder_name), normEntity(b.holder_name));
      const exactHolder = norm(a.holder_name) === norm(b.holder_name);
      if (exactHolder) {
        score += 55; reasons.push('Exact holder name');
      } else if (holderSim >= 0.70) {
        score += holderSim * 45; reasons.push(`Holder name ${Math.round(holderSim * 100)}% similar`);
      } else if (holderTri >= 0.75) {
        score += holderTri * 35; reasons.push(`Holder ${Math.round(holderTri * 100)}% similar`);
      } else {
        // Holder name too different — not a duplicate
        return { score: 0, reasons: [], exact: false };
      }

      // ── Corroborating fields ──────────────────────────────────────────────
      const eA = norm(a.email || '');
      const eB = norm(b.email || '');
      if (eA && eB && eA === eB) { score += 30; reasons.push('Identical email'); }

      const mA = (a.mobile || a.phone || '').replace(/\D/g, '').slice(-10);
      const mB = (b.mobile || b.phone || '').replace(/\D/g, '').slice(-10);
      if (mA.length >= 10 && mA === mB) { score += 20; reasons.push('Same mobile'); }

      if (typeA && typeB && typeA === typeB) { score += 10; reasons.push(`Same DSC type (${a.dsc_type})`); }
      if (classA && classB && classA === classB) { score += 8; reasons.push('Same DSC class'); }

      // Expiry proximity
      if (a.expiry_date && b.expiry_date) {
        const diff = Math.abs(new Date(a.expiry_date) - new Date(b.expiry_date)) / 86400000;
        if (diff === 0) { score += 15; reasons.push('Identical expiry date'); }
        else if (diff <= 30) { score += 8; reasons.push(`Expiry within ${Math.round(diff)} days of each other`); }
      }

      const exact = exactHolder && (eA && eB && eA === eB) && typeA === typeB;
      return { score, reasons, exact };
    },
    58  // Needs strong holder name + at least one corroborating field
  );
};

// ─── DOCUMENTS REGISTER ───────────────────────────────────────────────────────
export const detectDocumentDuplicates = (docs) => {
  return groupDuplicates(
    docs,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // Document number — unique identifier
      const dnA = normId(a.document_number || a.reference_no || '');
      const dnB = normId(b.document_number || b.reference_no || '');
      const exactDocNum = dnA.length > 3 && dnB.length > 3 && dnA === dnB;
      if (exactDocNum) { score += 90; reasons.push('Identical document number'); }

      // PAN
      const pA = normId(a.pan || '');
      const pB = normId(b.pan || '');
      if (pA.length >= 10 && pB.length >= 10 && pA === pB) { score += 75; reasons.push('Identical PAN'); }

      if (exactDocNum || (pA && pB && pA === pB)) {
        return { score, reasons, exact: true };
      }

      // Holder name gate
      const holderA = normEntity(a.holder_name || '');
      const holderB = normEntity(b.holder_name || '');
      if (!holderA || !holderB) return { score: 0, reasons: [], exact: false };

      const holderSim = Math.max(jaccardSim(holderA, holderB), trigramSim(holderA, holderB));
      const exactHolder = norm(a.holder_name) === norm(b.holder_name);

      if (exactHolder) { score += 50; reasons.push('Exact holder name'); }
      else if (holderSim >= 0.70) { score += holderSim * 40; reasons.push(`Holder ${Math.round(holderSim * 100)}% similar`); }
      else { return { score: 0, reasons: [], exact: false }; }

      const sameType = a.document_type && b.document_type &&
        norm(a.document_type) === norm(b.document_type);
      if (sameType) { score += 20; reasons.push(`Same document type (${a.document_type})`); }

      const assocA = normEntity(a.associated_with || '');
      const assocB = normEntity(b.associated_with || '');
      if (assocA && assocB && jaccardSim(assocA, assocB) > 0.6) {
        score += 15; reasons.push('Same associated entity');
      }

      if (a.notes && b.notes) {
        const noteSim = jaccardSim(a.notes, b.notes);
        if (noteSim > 0.55) { score += noteSim * 12; reasons.push(`Notes ${Math.round(noteSim * 100)}% similar`); }
      }

      return { score, reasons, exact: exactHolder && sameType };
    },
    52
  );
};

// ─── PASSWORD VAULT ───────────────────────────────────────────────────────────
/**
 * v2 Logic:
 * - A company legitimately has MANY different portal passwords (GST, DGFT,
 *   Income Tax, MCA, Trademark, etc.) — same company ≠ duplicate.
 * - True duplicate = same client + same portal/service + same or very similar
 *   username/login ID.
 * - Portal type is now a GATING criterion alongside client name.
 *   If portal types differ, the pair is NOT a duplicate (different services).
 * - Username/login similarity is required as third confirmation.
 */
export const detectPasswordDuplicates = (entries) => {
  return groupDuplicates(
    entries,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── Gate 1: Portal / service type must match ──────────────────────────
      const portalA = norm(a.portal_type || a.service_type || a.type || '');
      const portalB = norm(b.portal_type || b.service_type || b.type || '');
      if (portalA && portalB && portalA !== portalB) {
        // GST portal ≠ DGFT portal — completely different credentials
        return { score: 0, reasons: [], exact: false };
      }
      const samePortal = portalA && portalB && portalA === portalB;

      // ── Gate 2: Client/company name must be similar ───────────────────────
      const clientA = normEntity(a.client_name || a.company_name || '');
      const clientB = normEntity(b.client_name || b.company_name || '');
      if (!clientA || !clientB) return { score: 0, reasons: [], exact: false };

      const clientSim   = Math.max(jaccardSim(clientA, clientB), trigramSim(clientA, clientB));
      const exactClient = norm(a.client_name || a.company_name || '') ===
                          norm(b.client_name || b.company_name || '');

      if (!exactClient && clientSim < 0.55) {
        return { score: 0, reasons: [], exact: false };
      }

      if (exactClient) { score += 40; reasons.push('Same client'); }
      else { score += clientSim * 30; reasons.push(`Client ${Math.round(clientSim * 100)}% similar`); }

      if (samePortal) { score += 20; reasons.push(`Same portal/service (${a.portal_type || a.service_type || a.type})`); }

      // ── Gate 3: Username / login ID must match or be very similar ─────────
      const uA = norm(a.username || a.user_id || a.login_id || '');
      const uB = norm(b.username || b.user_id || b.login_id || '');

      if (!uA || !uB) {
        // No username — only flag if client + portal + PAN all match exactly
        const pA2 = normId(a.pan || '');
        const pB2 = normId(b.pan || '');
        const exactPan2 = pA2.length >= 10 && pB2.length >= 10 && pA2 === pB2;
        if (exactPan2 && samePortal && exactClient) {
          score += 35; reasons.push('Same PAN + same portal + same client');
          return { score, reasons, exact: true };
        }
        return { score: 0, reasons: [], exact: false };
      }

      const exactUser = uA === uB;
      const userSim   = editSim(uA, uB);

      if (exactUser) {
        score += 40; reasons.push('Identical username/login ID');
      } else if (userSim >= 0.88) {
        score += userSim * 30; reasons.push(`Username ${Math.round(userSim * 100)}% similar`);
      } else {
        // Username too different — likely different credentials for same portal
        return { score: 0, reasons: [], exact: false };
      }

      // PAN match adds strong confirmation
      const pA = normId(a.pan || '');
      const pB = normId(b.pan || '');
      if (pA.length >= 10 && pB.length >= 10 && pA === pB) {
        score += 20; reasons.push('Identical PAN');
      }

      const dA = norm(a.department || '');
      const dB = norm(b.department || '');
      if (dA && dB && dA === dB) { score += 5; reasons.push(`Same department (${a.department})`); }

      const exact = exactClient && samePortal && exactUser;
      return { score, reasons, exact };
    },
    68  // High threshold — needs client + portal + username all aligned
  );
};
