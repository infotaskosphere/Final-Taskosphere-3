from typing import Dict, Any, List, Optional
import logging
import pandas as pd
import numpy as np
import difflib
from datetime import datetime

logger = logging.getLogger("gst_reconciliation_engine")

class GSTReconciliationEngine:
    @staticmethod
    def _to_num(val) -> float:
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return 0.0
        try:
            return float(str(val).replace(",", "").strip())
        except (ValueError, TypeError):
            return 0.0

    @staticmethod
    def _normalise_invoice(val) -> str:
        s = str(val or "").strip().upper().replace(" ", "")
        # Standard normalization: strip leading zeros, common delimiters
        import re
        s = re.sub(r'^(INV|INVOICE|BILL|GST|TAX|PO)[/\-#]*', '', s)
        parts = re.split(r'[/\-\.#]', s)
        numeric_parts = [p for p in parts if p.isdigit()]
        if numeric_parts:
            # pick longest numeric block as primary serial code
            best = max(numeric_parts, key=len)
            return best.lstrip("0") or "0"
        return s.lstrip("0") or "0"

    @classmethod
    def reconcile_books_vs_portal(
        cls,
        books_invoices: List[Dict[str, Any]],
        portal_invoices: List[Dict[str, Any]],
        tolerance: float = 1.01,
        enable_fuzzy: bool = True,
        fuzzy_threshold: float = 0.8
    ) -> Dict[str, Any]:
        """
        Reconciles client's purchase/sales registers (Books) against portal filings.
        Supports multi-key matching, fuzzy lookup, and discrepancy classification.
        """
        matched = []
        mismatch = []
        portal_only = []
        books_only = []
        duplicate_books = []
        duplicate_portal = []

        seen_books_keys = set()
        seen_portal_keys = set()

        # Find duplicates early
        clean_books = []
        for b in books_invoices:
            gstin = (b.get("gstin") or b.get("supplier_gstin") or "").strip().upper()
            inv_no = cls._normalise_invoice(b.get("invoice_no") or b.get("invoice_number") or "")
            key = f"{gstin}__{inv_no}"
            if key in seen_books_keys:
                duplicate_books.append(b)
            else:
                seen_books_keys.add(key)
                b["_normalised_key"] = key
                b["invoice_value"] = cls._to_num(b.get("invoice_value") or b.get("total_invoice_value") or 0.0)
                clean_books.append(b)

        clean_portal = []
        for p in portal_invoices:
            gstin = (p.get("gstin") or p.get("supplier_gstin") or "").strip().upper()
            inv_no = cls._normalise_invoice(p.get("invoice_no") or p.get("invoice_number") or "")
            key = f"{gstin}__{inv_no}"
            if key in seen_portal_keys:
                duplicate_portal.append(p)
            else:
                seen_portal_keys.add(key)
                p["_normalised_key"] = key
                p["invoice_value"] = cls._to_num(p.get("invoice_value") or p.get("total_invoice_value") or 0.0)
                clean_portal.append(p)

        # Build lookup maps
        books_map = {b["_normalised_key"]: b for b in clean_books}
        portal_map = {p["_normalised_key"]: p for p in clean_portal}

        # Match iteration
        all_keys = set(books_map.keys()) | set(portal_map.keys())
        books_matched_keys = set()

        for key in all_keys:
            in_books = key in books_map
            in_portal = key in portal_map

            if in_books and in_portal:
                b = books_map[key]
                p = portal_map[key]
                books_matched_keys.add(key)

                b_val = b["invoice_value"]
                p_val = p["invoice_value"]
                val_diff = abs(b_val - p_val)

                b_tax = cls._to_num(b.get("igst", 0.0) + b.get("cgst", 0.0) + b.get("sgst", 0.0))
                p_tax = cls._to_num(p.get("igst", 0.0) + p.get("cgst", 0.0) + p.get("sgst", 0.0))
                tax_diff = abs(b_tax - p_tax)

                if val_diff <= tolerance and tax_diff <= tolerance:
                    matched.append({
                        "books": b,
                        "portal": p,
                        "key": key,
                        "status": "matched",
                        "itc_eligible": p.get("itc_availability") != "INELIGIBLE"
                    })
                else:
                    # Provide smart audit suggestion
                    suggested_action = "Accept rounding difference"
                    severity = "low"
                    if val_diff > 100:
                        severity = "high"
                        if b_val > p_val:
                            suggested_action = "Understated by supplier on portal. Request GSTR-1 amendment."
                        else:
                            suggested_action = "Understated in books. Please verify and amend booking entry."
                    elif tax_diff > tolerance:
                        severity = "medium"
                        suggested_action = "GST rate mismatch. Check HSN code classification."

                    mismatch.append({
                        "books": b,
                        "portal": p,
                        "key": key,
                        "status": "mismatch",
                        "value_diff": round(p_val - b_val, 2),
                        "tax_diff": round(p_tax - b_tax, 2),
                        "suggested_action": suggested_action,
                        "severity": severity
                    })

            elif in_portal:
                # Invoice only in portal, missing from books
                p = portal_map[key]
                # Check fuzzy match
                fuzzy_hit = None
                if enable_fuzzy:
                    p_inv_no = cls._normalise_invoice(p.get("invoice_no") or "")
                    for bk, b_cand in books_map.items():
                        if bk in books_matched_keys:
                            continue
                        b_inv_no = cls._normalise_invoice(b_cand.get("invoice_no") or "")
                        sim = difflib.SequenceMatcher(None, p_inv_no, b_inv_no).ratio()
                        if sim >= fuzzy_threshold:
                            fuzzy_hit = b_cand
                            books_matched_keys.add(bk)
                            break

                if fuzzy_hit:
                    matched.append({
                        "books": fuzzy_hit,
                        "portal": p,
                        "key": key,
                        "status": "fuzzy_matched",
                        "similarity": round(sim, 2),
                        "itc_eligible": p.get("itc_availability") != "INELIGIBLE"
                    })
                else:
                    portal_only.append({
                        "portal": p,
                        "key": key,
                        "status": "missing_in_books",
                        "suggested_action": "Accrue purchase in books or claim deferred input credit."
                    })
            else:
                # Invoice in books, missing from portal (unfiled by vendor)
                if key not in books_matched_keys:
                    b = books_map[key]
                    books_only.append({
                        "books": b,
                        "key": key,
                        "status": "missing_in_portal",
                        "suggested_action": "Vendor has not filed. Send notice to vendor or withhold payment."
                    })

        # Calculate high level statistics
        summary = {
            "total_books_invoices": len(books_invoices),
            "total_portal_invoices": len(portal_invoices),
            "matched_count": len(matched),
            "mismatch_count": len(mismatch),
            "missing_in_books_count": len(portal_only),
            "missing_in_portal_count": len(books_only),
            "duplicate_books_count": len(duplicate_books),
            "duplicate_portal_count": len(duplicate_portal),
            "reconciliation_rate": round((len(matched) / max(len(books_invoices), 1)) * 100.0, 2)
        }

        return {
            "summary": summary,
            "matched": matched,
            "mismatch": mismatch,
            "portal_only": portal_only,
            "books_only": books_only,
            "duplicates": {
                "books": duplicate_books,
                "portal": duplicate_portal
            }
        }
