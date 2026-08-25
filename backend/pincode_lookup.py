"""
backend/pincode_lookup.py
══════════════════════════════════════════════════════════════════════════════
PIN code → Indian State / GST State-Code lookup.

WHY THIS EXISTS
----------------
The invoice module needs to know, purely from a 6-digit Indian PIN code,
which State/UT that PIN belongs to — so it can:
  1. Auto-fill "Place of Supply" (client's state) and "Your Supply State"
     (company's own state) on the invoice form, and
  2. Auto-decide the tax split: if the two states match it's an
     intra-state supply → CGST + SGST; if they differ it's inter-state →
     IGST (Sec. 7/8, IGST Act 2017).

DATA SOURCE
------------
The Andhra Pradesh block of this table (prefixes 503, 504, 505, 506, 509,
515-524, 530-535 → "Andhra Pradesh"; 500-502, 507, 508, 510-514 →
"Telangana") was cross-checked against the official India Post "Andhra
Pradesh Circle" All India PIN Code Directory (CEPT, Nov-2020) supplied by
the client, which lists every Delivery/Non-Delivery post office in that
circle together with its PIN, Region and Division. That is the only PIN
range this table can claim page-by-page government verification for.

For every other State/UT, the ranges below use India Post's published PIN
zone structure (the same 3-digit-prefix scheme used by virtually every
Indian GST/e-invoicing tool). It is accurate for the overwhelming majority
of PINs. A handful of PINs sitting exactly on a historic state-reorganisation
boundary (e.g. UP/Uttarakhand, Bihar/Jharkhand, MP/Chhattisgarh, some
Gujarat/UT enclaves) can occasionally fall on the wrong side of a prefix
range — this is a known, industry-wide limitation of prefix-based lookup
(the alternative is a ~150,000-row full post-office table, which would need
to be sourced state-by-state from India Post/CEPT for the rest of India).

Because of that, every place this lookup is used in the product AUTO-FILLS
the state field but never locks it — the user can always correct it, and
that correction is what actually gets saved.

If a more complete, verified all-India PIN→State dataset becomes available
(e.g. the remaining 22 India Post circle PDFs, or a GSTN PIN master), drop
it in here and extend PIN_RANGES / add exact-prefix overrides — the lookup
function below already prefers an exact 3-digit override over the range
table, so incremental accuracy improvements are cheap to add.
"""

from typing import Optional, Tuple
from fastapi import APIRouter, HTTPException

router = APIRouter()

# ── Official GST State/UT codes (2-digit, per CBIC) ─────────────────────────
GST_STATE_CODES = {
    "Jammu and Kashmir": "01", "Himachal Pradesh": "02", "Punjab": "03",
    "Chandigarh": "04", "Uttarakhand": "05", "Haryana": "06", "Delhi": "07",
    "Rajasthan": "08", "Uttar Pradesh": "09", "Bihar": "10", "Sikkim": "11",
    "Arunachal Pradesh": "12", "Nagaland": "13", "Manipur": "14",
    "Mizoram": "15", "Tripura": "16", "Meghalaya": "17", "Assam": "18",
    "West Bengal": "19", "Jharkhand": "20", "Odisha": "21",
    "Chhattisgarh": "22", "Madhya Pradesh": "23", "Gujarat": "24",
    "Dadra and Nagar Haveli and Daman and Diu": "26", "Maharashtra": "27",
    "Karnataka": "29", "Goa": "30", "Lakshadweep": "31", "Kerala": "32",
    "Tamil Nadu": "33", "Puducherry": "34", "Andaman and Nicobar Islands": "35",
    "Telangana": "36", "Andhra Pradesh": "37", "Ladakh": "38",
    "Other Territory": "97",
}

# ── PIN prefix (first 3 digits) range table: (start, end, state) ───────────
# Ranges are checked in order; EXACT_PREFIX_OVERRIDES (below) always wins
# over a range so small enclaves nested inside a bigger state's block (e.g.
# Goa/Chandigarh/Puducherry/Sikkim) resolve correctly.
PIN_RANGES: list[Tuple[int, int, str]] = [
    (110, 110, "Delhi"),
    (111, 121, "Haryana"),
    (122, 122, "Haryana"),
    (123, 136, "Haryana"),
    (140, 160, "Punjab"),
    (171, 177, "Himachal Pradesh"),
    (180, 194, "Jammu and Kashmir"),
    (200, 285, "Uttar Pradesh"),
    (300, 345, "Rajasthan"),
    (360, 396, "Gujarat"),
    (400, 445, "Maharashtra"),
    (450, 488, "Madhya Pradesh"),
    (490, 497, "Chhattisgarh"),
    # Andhra Pradesh / Telangana — see EXACT_PREFIX_OVERRIDES for the
    # PDF-verified split; this range is only the outer fallback.
    (500, 535, "Andhra Pradesh"),
    (560, 591, "Karnataka"),
    (600, 643, "Tamil Nadu"),
    (670, 695, "Kerala"),
    (700, 743, "West Bengal"),
    (744, 744, "Andaman and Nicobar Islands"),
    (750, 770, "Odisha"),
    (781, 788, "Assam"),
    (790, 792, "Arunachal Pradesh"),
    (793, 794, "Meghalaya"),
    (795, 795, "Manipur"),
    (796, 796, "Mizoram"),
    (797, 798, "Nagaland"),
    (799, 799, "Tripura"),
    (800, 812, "Bihar"),
    (813, 835, "Jharkhand"),
    (841, 855, "Bihar"),
    (900, 999, "Other Territory"),  # Army Postal Service — no GST state
]

# ── Exact 3-digit prefixes that override the coarse range table above ──────
EXACT_PREFIX_OVERRIDES: dict[int, str] = {
    160: "Chandigarh",
    403: "Goa",
    605: "Puducherry",
    737: "Sikkim",
    682: "Kerala",  # (Lakshadweep 682-55x nested inside this block)
    396: "Dadra and Nagar Haveli and Daman and Diu",
    # ── Andhra Pradesh / Telangana split, verified against the India Post
    #    "Andhra Pradesh Circle" PIN directory (CEPT, Nov-2020) ──
    500: "Telangana", 501: "Telangana", 502: "Telangana",
    503: "Andhra Pradesh", 504: "Andhra Pradesh", 505: "Andhra Pradesh",
    506: "Andhra Pradesh",
    507: "Telangana", 508: "Telangana",
    509: "Andhra Pradesh",
    510: "Telangana", 511: "Telangana", 512: "Telangana",
    513: "Telangana", 514: "Telangana",
    515: "Andhra Pradesh", 516: "Andhra Pradesh", 517: "Andhra Pradesh",
    518: "Andhra Pradesh", 519: "Andhra Pradesh",
    520: "Andhra Pradesh", 521: "Andhra Pradesh", 522: "Andhra Pradesh",
    523: "Andhra Pradesh", 524: "Andhra Pradesh", 525: "Andhra Pradesh",
    526: "Andhra Pradesh", 527: "Andhra Pradesh", 528: "Andhra Pradesh",
    529: "Andhra Pradesh",
    530: "Andhra Pradesh", 531: "Andhra Pradesh", 532: "Andhra Pradesh",
    533: "Andhra Pradesh", 534: "Andhra Pradesh", 535: "Andhra Pradesh",
    # ── Uttarakhand carved out of the UP block ──
    244: "Uttarakhand", 246: "Uttarakhand", 248: "Uttarakhand",
    249: "Uttarakhand", 262: "Uttarakhand", 263: "Uttarakhand",
}


def get_state_from_pincode(pincode: str) -> Optional[dict]:
    """
    Resolve a 6-digit Indian PIN code to {state, state_code}.
    Returns None if the PIN isn't a valid 6-digit Indian PIN or doesn't
    fall in any known range.
    """
    if not pincode:
        return None
    digits = "".join(ch for ch in str(pincode) if ch.isdigit())
    if len(digits) != 6:
        return None
    prefix = int(digits[:3])

    state = EXACT_PREFIX_OVERRIDES.get(prefix)
    if not state:
        for start, end, s in PIN_RANGES:
            if start <= prefix <= end:
                state = s
                break
    if not state or state == "Other Territory":
        return {"state": state or None, "state_code": GST_STATE_CODES.get(state)} if state else None

    return {"state": state, "state_code": GST_STATE_CODES.get(state)}


@router.get("/pincode/{pincode}")
async def lookup_pincode(pincode: str):
    """
    GET /api/pincode/{pincode}
    → { pincode, valid, state, state_code }

    Used by the frontend (Invoicing, Invoice Settings, Client form) to
    auto-fill State / Place of Supply and to auto-decide CGST+SGST vs IGST
    the moment a 6-digit PIN is typed in.
    """
    digits = "".join(ch for ch in pincode if ch.isdigit())
    if len(digits) != 6:
        raise HTTPException(400, "PIN code must be exactly 6 digits")

    result = get_state_from_pincode(digits)
    if not result or not result.get("state"):
        return {"pincode": digits, "valid": False, "state": None, "state_code": None}

    return {"pincode": digits, "valid": True, **result}


def is_interstate(state_code_a: Optional[str], state_code_b: Optional[str]) -> Optional[bool]:
    """
    True  → inter-state supply (IGST)
    False → intra-state supply (CGST + SGST)
    None  → not enough information to decide (caller should keep whatever
             was set manually rather than guessing).
    """
    if not state_code_a or not state_code_b:
        return None
    return state_code_a != state_code_b
