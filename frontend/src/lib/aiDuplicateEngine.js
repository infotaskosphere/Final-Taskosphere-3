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

/**
 * Address normalisation — canonicalises the common Indian-address abbreviation
 * pairs (Road/Rd, Street/St, Society/Soc, ...) so "123 MG Road" and
 * "123 M.G. Rd" compare equal instead of failing on wording alone.
 */
const ADDR_CANON = [
  [/\broad\b/g, 'rd'],
  [/\bstreet\b/g, 'st'],
  [/\bavenue\b/g, 'ave'],
  [/\blane\b/g, 'ln'],
  [/\bfloor\b/g, 'fl'],
  [/\bnear\b/g, ''],
  [/\bopp(osite)?\b/g, ''],
  [/\bbuilding\b/g, 'bldg'],
  [/\bapartments?\b/g, 'apt'],
  [/\bsociety\b/g, 'soc'],
  [/\bindustrial\b/g, 'ind'],
  [/\bestate\b/g, 'est'],
  [/\blimited\b/g, 'ltd'],
  [/\bprivate\b/g, 'pvt'],
];
export const normAddress = (s) => {
  let a = norm(s);
  ADDR_CANON.forEach(([re, rep]) => { a = a.replace(re, rep); });
  return a.replace(/\s+/g, ' ').trim();
};

/**
 * Best-match address similarity across every address field a client record
 * may carry (primary address vs. the GST-certificate address), since the two
 * duplicate records may each have only one of the two populated.
 */
const clientAddressList = (c) => [c.address, c.gst_address].filter(Boolean);
const addressSim = (a, b) => {
  const addrsA = clientAddressList(a);
  const addrsB = clientAddressList(b);
  if (!addrsA.length || !addrsB.length) return 0;
  let best = 0;
  addrsA.forEach((x) => addrsB.forEach((y) => {
    const s = Math.max(jaccardSim(normAddress(x), normAddress(y)), trigramSim(normAddress(x), normAddress(y)));
    if (s > best) best = s;
  }));
  return best;
};

/**
 * Every email / phone a client record carries — the top-level field PLUS
 * every contact person's email/phone — so two records that share a contact
 * person's number (not just the "main" one) are still corroborated.
 */
const allEmails = (c) => {
  const set = new Set();
  if (c.email) set.add(norm(c.email));
  (c.contact_persons || []).forEach((cp) => cp?.email && set.add(norm(cp.email)));
  return set;
};
const allPhones = (c) => {
  const set = new Set();
  if (c.phone) set.add(normPhone(c.phone));
  (c.contact_persons || []).forEach((cp) => cp?.phone && set.add(normPhone(cp.phone)));
  return set;
};
const sharedValue = (setA, setB) => {
  for (const v of setA) { if (v && setB.has(v)) return v; }
  return null;
};

/**
 * Detects the classic "same person, middle name added/dropped" pattern —
 * e.g. "Jayesh Dhanrajani" vs. "Jayesh Kishore Dhanrajani" — WITHOUT
 * flagging genuinely different family members who merely share a surname
 * (e.g. "Urvi Jayesh Dhanrajani" is NOT a match for "Jayesh Dhanrajani":
 * the first tokens differ). Requires the first AND last name token to match
 * exactly and the token counts to differ (one name has an extra middle part).
 */
const sameFirstLastName = (rawA, rawB) => {
  const ta = normEntity(rawA).split(' ').filter(Boolean);
  const tb = normEntity(rawB).split(' ').filter(Boolean);
  if (ta.length < 2 || tb.length < 2 || ta.length === tb.length) return false;
  return ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
};

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
      const { score, reasons, exact, tier } = scoreAndReason(a, b);
      if (!exact && !tier && score < threshold) return;
      if (score <= 0 && !exact && !tier) return;
      group.push(b.id);
      allR.push({ id: b.id, score: Math.round(score), reasons, exact, tier });
    });

    if (group.length > 1) {
      // Tiered detectors (e.g. clients) supply an explicit 'duplicate' | 'possible'
      // | 'related' tier per pair — the group takes on the strongest tier seen.
      // Untiered detectors fall back to the original high/medium scheme.
      let confidence;
      if (allR.some((r) => r.tier)) {
        const order = ['duplicate', 'possible', 'related'];
        confidence = order.find((t) => allR.some((r) => r.tier === t)) || 'possible';
      } else {
        const hasHigh = allR.some((r) => r.exact || r.score >= 70);
        confidence = hasHigh ? 'high' : 'medium';
      }
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
 * TRUE DUPLICATE DEFINITION FOR CLIENTS — v2 (multi-parameter)
 * ──────────────────────────────────────────────────────────────
 * Checks every identifier a CA/CS practice actually relies on, not just
 * name + one phone + one email, and reports THREE distinct outcomes
 * instead of a single high/medium bucket:
 *
 *   🔴 duplicate  (score ≥ 85, or any legal-ID exact match)
 *      Same legal entity beyond reasonable doubt.
 *
 *   🟠 possible   (score 55–84)
 *      Strong signal (near-identical name, or normalised-suffix-exact
 *      name match) but not fully corroborated — needs human review.
 *      Crucially: a near-identical name is enough to land here on its
 *      own — it no longer needs a matching phone/email to surface at all,
 *      which previously caused true duplicates like "Jayesh Medical Store"
 *      vs. "Jayesh Medical Stores" to be silently dropped.
 *
 * 1. LEGAL-ID GATE (bypasses the name check entirely — legally unique in India)
 *    PAN · GSTIN · CIN · LLPIN · Udyam/MSME registration number
 *
 * 2. NAME MATCH (after stripping legal suffixes — Pvt/Private/Ltd/Limited/LLP/…)
 *    - Exact match after normalisation (e.g. "ABC Pvt Ltd" ≡ "ABC Private Limited")
 *    - Jaccard/trigram similarity bands
 *    - First-name + last-name exact match with an extra middle token
 *      (e.g. "Jayesh Dhanrajani" vs. "Jayesh Kishore Dhanrajani") — catches
 *      the same person entered with/without a middle name, without
 *      conflating different family members who merely share a surname
 *      ("Urvi Jayesh Dhanrajani" is correctly NOT matched — first token differs)
 *
 * 3. CORROBORATION (checked across ALL emails/phones on the record, including
 *    every contact person, not just the primary one)
 *    email · phone · WhatsApp · address (primary or GST-certificate address,
 *    with Road/Rd, Street/St, Society/Soc, etc. normalised) · city+state
 *
 * THRESHOLD: 45 (low — the per-pair scorer itself returns 0 to reject a pair;
 * the tier, not this number, drives what the user sees).
 */
export const detectClientDuplicates = (clients) =>
  groupDuplicates(
    clients,
    (a, b) => {
      const reasons = [];
      let score = 0;

      // ── Legal-ID gate — any ONE exact match is legally conclusive ──────────
      const idFields = [
        ['gstin', 15, 'GSTIN'],
        ['pan', 10, 'PAN'],
        ['cin', 21, 'CIN'],
        ['llpin', 7, 'LLPIN'],
        ['msme_number', 5, 'Udyam/MSME registration number'],
      ];
      for (const [field, minLen, label] of idFields) {
        const vA = normId(a[field] || '');
        const vB = normId(b[field] || '');
        if (vA.length >= minLen && vB.length >= minLen && vA === vB) {
          return { score: 97, reasons: [`Identical ${label} — legally same entity`], exact: true, tier: 'duplicate' };
        }
      }

      // ── Name gate ────────────────────────────────────────────────────────
      const rawNameA = a.company_name || a.name || '';
      const rawNameB = b.company_name || b.name || '';
      if (!rawNameA.trim() || !rawNameB.trim()) return { score: 0, reasons: [], exact: false };

      const exactNameRaw   = norm(rawNameA) === norm(rawNameB);
      const exactEntity    = !exactNameRaw && normEntity(rawNameA) && normEntity(rawNameA) === normEntity(rawNameB);
      const nameSim        = bestEntitySim(rawNameA, rawNameB);
      const middleNameOnly = sameFirstLastName(rawNameA, rawNameB);

      // Hard stop: nothing suggests these are the same entity/person
      if (!exactNameRaw && !exactEntity && !middleNameOnly && nameSim < 0.55) {
        return { score: 0, reasons: [], exact: false };
      }

      if (exactNameRaw) {
        score += 82;
        reasons.push('Exact company name');
      } else if (exactEntity) {
        score += 78;
        reasons.push('Same name after normalising Pvt/Private/Ltd/Limited/LLP suffixes');
      } else if (nameSim >= 0.88) {
        score += 68;
        reasons.push(`Company name ${Math.round(nameSim * 100)}% similar`);
      } else if (nameSim >= 0.78) {
        score += 58;
        reasons.push(`Company name ${Math.round(nameSim * 100)}% similar`);
      } else if (nameSim >= 0.55) {
        score += 34;
        reasons.push(`Company name loosely similar (${Math.round(nameSim * 100)}%)`);
      }

      if (middleNameOnly) {
        score = Math.max(score, 57);
        reasons.push('Same first & last name — likely the same person with/without a middle name');
      }

      // ── Corroborating fields (checked across every email/phone on file) ────
      const emailHit = sharedValue(allEmails(a), allEmails(b));
      if (emailHit) { score += 20; reasons.push('Shares an email address'); }

      const phoneHit = sharedValue(allPhones(a), allPhones(b));
      if (phoneHit) { score += 16; reasons.push('Shares a phone number'); }

      const addrSim = addressSim(a, b);
      if (addrSim >= 0.75) { score += 14; reasons.push('Same address'); }
      else if (addrSim >= 0.55) { score += 7; reasons.push('Similar address'); }

      // Proprietor / trade-name cross-check
      if (a.proprietor_name && b.proprietor_name) {
        const propSim = bestEntitySim(a.proprietor_name, b.proprietor_name);
        if (propSim >= 0.85) { score += 12; reasons.push('Same proprietor name'); }
      }

      // City + state together (weak individually, meaningful together)
      const sameCity  = a.city  && b.city  && norm(a.city)  === norm(b.city);
      const sameState = a.state && b.state && norm(a.state) === norm(b.state);
      if (sameCity && sameState) { score += 6; reasons.push(`Same city & state (${a.city}, ${a.state})`); }
      else if (sameCity) { score += 2; reasons.push(`Same city (${a.city})`); }

      // Same client type (minor corroboration)
      if (a.client_type && b.client_type && a.client_type === b.client_type) {
        score += 3;
        reasons.push(`Same type (${a.client_type})`);
      }

      if (score < 55) return { score: 0, reasons: [], exact: false };

      const tier = score >= 85 ? 'duplicate' : 'possible';
      const exact = exactNameRaw || exactEntity;
      return { score: Math.min(score, 100), reasons, exact, tier };
    },
    45
  );

/**
 * 🔵 RELATED CLIENT DETECTION
 * ───────────────────────────
 * NOT a duplicate check — a promoter/proprietor commonly runs 10–20
 * companies/LLPs through the same firm. This flags that relationship
 * ("this client shares a director/proprietor with an existing client")
 * WITHOUT blocking creation or suggesting a merge, so it is intentionally
 * kept separate from detectClientDuplicates and its 'duplicate'/'possible'
 * groups (which ARE merge-eligible).
 *
 * Signals (any one qualifies):
 *   - A contact person's DIN matches another client's contact person DIN
 *   - The proprietor_name on one record matches a contact person / the
 *     proprietor_name on another record
 *   - A contact person's name+email or name+phone matches another client's
 *     contact person
 * ...while the two records' own entity names are NOT already similar
 * (that case is already covered — and merge-eligible — via detectClientDuplicates).
 */
export const detectRelatedClients = (clients) =>
  groupDuplicates(
    clients,
    (a, b) => {
      const rawNameA = a.company_name || a.name || '';
      const rawNameB = b.company_name || b.name || '';
      // Already-similar names are handled (and merge-eligible) elsewhere.
      if (bestEntitySim(rawNameA, rawNameB) >= 0.55) return { score: 0, reasons: [], exact: false };

      const reasons = [];
      let matchedPerson = null;

      const dinsA = (a.contact_persons || []).map((cp) => normId(cp?.din || '')).filter((d) => d.length >= 5);
      const dinsB = (b.contact_persons || []).map((cp) => normId(cp?.din || '')).filter((d) => d.length >= 5);
      const sharedDin = dinsA.find((d) => dinsB.includes(d));
      if (sharedDin) reasons.push(`Shared director (DIN ${sharedDin})`);

      const peopleA = [
        ...(a.proprietor_name ? [a.proprietor_name] : []),
        ...(a.contact_persons || []).map((cp) => cp?.name).filter(Boolean),
      ];
      const peopleB = [
        ...(b.proprietor_name ? [b.proprietor_name] : []),
        ...(b.contact_persons || []).map((cp) => cp?.name).filter(Boolean),
      ];
      if (!sharedDin) {
        for (const pa of peopleA) {
          for (const pb of peopleB) {
            if (bestEntitySim(pa, pb) >= 0.90) { matchedPerson = pa; break; }
          }
          if (matchedPerson) break;
        }
        if (matchedPerson) reasons.push(`Same proprietor/director name (${matchedPerson})`);
      }

      if (!sharedDin && !matchedPerson) return { score: 0, reasons: [], exact: false };

      return { score: 40, reasons, exact: false, tier: 'related' };
    },
    35
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
// TODOS
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * TRUE DUPLICATE DEFINITION FOR TODOS
 * ─────────────────────────────────────
 * Todos in this system have: id, user_id, title, description, due_date, status.
 * There are NO department, assigned_to, or client_name fields on todos.
 *
 * A todo is a duplicate when:
 *
 * TIER 1 — Exact duplicate (score ≥ 95):
 *   Exact title match (normalised) for the same user → same task entered twice.
 *
 * TIER 2 — Near-duplicate (score ≥ 60):
 *   Title similarity ≥ 75% for the same user, OR
 *   Title similarity ≥ 85% across any users (admin view — same work entered by
 *   two different people).
 *
 * TIER 3 — Possible duplicate (score ≥ 50):
 *   Title similarity ≥ 60% for the same user AND description is also similar.
 *
 * Cross-user duplicates are allowed so that admins can catch cases where two
 * team members added the same todo item (e.g. synced email tasks).
 *
 * NUMBER/ID extraction: titles containing an application number like
 * "6749931" are treated as EXACT duplicates if the extracted number matches,
 * regardless of surrounding text differences (e.g. different TM class suffix).
 *
 * THRESHOLD: 50
 */

/** Extract all standalone number sequences of ≥ 5 digits from a string */
const extractNumbers = (s) => {
  const matches = (s || '').match(/\b\d{5,}\b/g);
  return matches ? matches.map((n) => n.trim()) : [];
};

export const detectTodoDuplicates = (todos) =>
  groupDuplicates(
    todos,
    (a, b) => {
      const reasons = [];
      let score = 0;

      const titleA = norm(a.title || '');
      const titleB = norm(b.title || '');
      if (!titleA || !titleB) return { score: 0, reasons: [], exact: false };

      // ── DEFINITIVE: shared application/reference numbers in title ─────────
      // e.g. "Examination Report — TM App No. 6749931 (Cl..." appear twice →
      // same application number = same underlying work = definite duplicate.
      const numsA = extractNumbers(a.title || '');
      const numsB = extractNumbers(b.title || '');
      const sharedNums = numsA.filter((n) => numsB.includes(n));
      if (sharedNums.length > 0) {
        // Shared number is a very strong signal — mark as exact duplicate
        return {
          score: 97,
          reasons: [`Shared reference/application number: ${sharedNums.join(', ')}`],
          exact: true,
        };
      }

      // ── Title similarity ───────────────────────────────────────────────────
      const exactTitle = titleA === titleB;
      const titleSim   = Math.max(jaccardSim(a.title, b.title), trigramSim(a.title, b.title));

      const sameUser = a.user_id && b.user_id && String(a.user_id) === String(b.user_id);

      if (exactTitle) {
        score += 60;
        reasons.push('Exact title match');
      } else if (titleSim >= 0.85) {
        score += Math.round(titleSim * 52);
        reasons.push(`Title ${Math.round(titleSim * 100)}% similar`);
      } else if (titleSim >= 0.70) {
        score += Math.round(titleSim * 38);
        reasons.push(`Title ${Math.round(titleSim * 100)}% similar`);
      } else if (titleSim >= 0.55 && sameUser) {
        // Lower threshold but only for same user — reduces false positives
        score += Math.round(titleSim * 24);
        reasons.push(`Title ${Math.round(titleSim * 100)}% similar (same owner)`);
      } else {
        // Title not similar enough — not worth flagging
        return { score: 0, reasons: [], exact: false };
      }

      // ── Same owner boosts confidence ──────────────────────────────────────
      if (sameUser) {
        score += 18;
        reasons.push('Same owner — likely entered twice');
      }

      // ── Description / notes similarity ────────────────────────────────────
      const descA = (a.description || a.notes || '').trim();
      const descB = (b.description || b.notes || '').trim();
      if (descA && descB) {
        const dSim = Math.max(jaccardSim(descA, descB), trigramSim(descA, descB));
        if (dSim >= 0.70) {
          score += Math.round(dSim * 20);
          reasons.push(`Description ${Math.round(dSim * 100)}% similar`);
        } else if (dSim >= 0.45) {
          score += Math.round(dSim * 12);
          reasons.push(`Description partially similar (${Math.round(dSim * 100)}%)`);
        }
      }

      // ── Same due date ─────────────────────────────────────────────────────
      if (a.due_date && b.due_date) {
        try {
          const dA = new Date(a.due_date).toDateString();
          const dB = new Date(b.due_date).toDateString();
          if (dA === dB && dA !== 'Invalid Date') {
            score += 10;
            reasons.push('Same due date');
          }
        } catch (_) { /* ignore invalid dates */ }
      }

      // ── Same status (both pending or both completed) ──────────────────────
      const stA = norm(a.status || '');
      const stB = norm(b.status || '');
      if (stA && stB && stA === stB) {
        score += 5;
        reasons.push(`Same status (${a.status})`);
      }

      const exact = exactTitle && sameUser;
      return { score, reasons, exact };
    },
    50  // Lower threshold — todos have fewer fields; title + owner is sufficient
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

// ─── Compliance Duplicate Detector ───────────────────────────────────────────
// Detects duplicate compliance items: same name + same category (+ optional FY)
export const detectComplianceDuplicates = (items) =>
  groupDuplicates(
    items,
    (a, b) => {
      let score = 0;
      const reasons = [];

      const nameA = norm(a.name || '');
      const nameB = norm(b.name || '');
      if (!nameA || !nameB) return { score: 0, reasons: [], exact: false };

      // Name similarity — primary signal
      const nameSim = Math.max(trigramSim(nameA, nameB), jaccardSim(nameA, nameB));
      const exactName = nameA === nameB;
      if (exactName) { score += 50; reasons.push('Exact compliance name'); }
      else if (nameSim >= 0.80) { score += Math.round(nameSim * 40); reasons.push(`Name ${Math.round(nameSim * 100)}% similar`); }
      else if (nameSim >= 0.55) { score += Math.round(nameSim * 25); reasons.push(`Name partially similar`); }
      else return { score: 0, reasons: [], exact: false };

      // Category must match — GST vs ITR are different compliance types
      const sameCategory = a.category && b.category &&
        norm(a.category) === norm(b.category);
      if (!sameCategory) return { score: 0, reasons: [], exact: false };
      score += 25; reasons.push(`Same category (${a.category})`);

      // Same FY year
      if (a.fy_year && b.fy_year && a.fy_year === b.fy_year) {
        score += 15; reasons.push('Same financial year');
      }

      // Same frequency
      if (a.frequency && b.frequency && a.frequency === b.frequency) {
        score += 10; reasons.push('Same frequency');
      }

      return { score, reasons, exact: exactName && sameCategory };
    },
    55
  );
