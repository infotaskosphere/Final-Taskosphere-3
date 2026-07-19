"""
Bank Statement Parser Module (Phase 8)
Parses various bank statement formats (CSV, Excel, PDF, Images) into standard structured transactions.
Includes robust rule-based parsing with AI (Gemini) fallback for complex layouts.
"""

import io
import csv
import logging
import base64
import re
from datetime import datetime
from typing import List, Dict, Any, Optional

import pandas as pd
import pdfplumber
from PIL import Image

from backend.services.gemini_client import get_gemini_client, gemini_extract_json

logger = logging.getLogger("bank_statement_parser")

class BankStatementParser:
    @staticmethod
    def clean_amount(val: Any) -> float:
        """
        Cleans numeric amounts from currency strings and formats.
        """
        if pd.isna(val) or val is None:
            return 0.0
        val_str = str(val).strip()
        if not val_str:
            return 0.0
        # Remove currency symbols, commas, spaces
        cleaned = re.sub(r'[^\d.\-]', '', val_str)
        try:
            return float(cleaned)
        except ValueError:
            return 0.0

    @staticmethod
    def parse_date(val: Any) -> str:
        """
        Normalises date string to YYYY-MM-DD.
        """
        if pd.isna(val) or val is None:
            return datetime.now().strftime("%Y-%m-%d")
        val_str = str(val).strip()
        # Try various formats
        for fmt in (
            "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y",
            "%Y/%m/%d", "%d-%b-%Y", "%d-%B-%Y", "%d %b %Y",
            "%d %B %Y", "%b %d, %Y"
        ):
            try:
                return datetime.strptime(val_str, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        # Fallback regex search for date
        match = re.search(r'(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{2,4})', val_str)
        if match:
            # Simple fallback format guess
            day, month, year = match.groups()
            if len(year) == 2:
                year = f"20{year}"
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        return val_str

    @classmethod
    def parse_csv(cls, file_bytes: bytes, bank_account_id: str) -> List[Dict[str, Any]]:
        """
        Parses CSV bank statements dynamically mapping column headers.
        """
        # Convert bytes to string
        text = file_bytes.decode('utf-8', errors='ignore')
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        
        # Skip potential bank header metadata lines to find transaction tables
        table_start_index = 0
        for idx, line in enumerate(lines[:15]):
            # Heuristic: headers usually contain date, description/narration, amount/debit/credit
            l_lower = line.lower()
            if "date" in l_lower and ("narration" in l_lower or "description" in l_lower or "particulars" in l_lower or "transaction" in l_lower):
                table_start_index = idx
                break

        csv_data = "\n".join(lines[table_start_index:])
        df = pd.read_csv(io.StringIO(csv_data))
        return cls._parse_dataframe(df, bank_account_id)

    @classmethod
    def parse_excel(cls, file_bytes: bytes, bank_account_id: str) -> List[Dict[str, Any]]:
        """
        Parses Excel statements using pandas.
        """
        df = pd.read_excel(io.BytesIO(file_bytes))
        # Find starting row of actual transactions if metadata exists at top
        header_row = 0
        for idx, row in df.head(15).iterrows():
            row_str = " ".join([str(x).lower() for x in row.values if not pd.isna(x)])
            if "date" in row_str and ("narration" in row_str or "description" in row_str or "particulars" in row_str):
                header_row = idx
                break
        
        # Re-parse or slice if header is below row 0
        if header_row > 0:
            df.columns = df.iloc[header_row]
            df = df.iloc[header_row+1:].reset_index(drop=True)

        return cls._parse_dataframe(df, bank_account_id)

    @classmethod
    def _parse_dataframe(cls, df: pd.DataFrame, bank_account_id: str) -> List[Dict[str, Any]]:
        """
        Fuzzy column mapping helper to standardise transaction records.
        """
        cols = [str(c).strip().lower() for c in df.columns]
        
        # Map indices
        date_idx = -1
        narration_idx = -1
        debit_idx = -1
        credit_idx = -1
        amount_idx = -1
        balance_idx = -1

        for i, col in enumerate(cols):
            if "date" in col:
                date_idx = i
            elif any(x in col for x in ("narration", "description", "particulars", "remarks", "detail")):
                narration_idx = i
            elif "debit" in col or "withdrawal" in col:
                debit_idx = i
            elif "credit" in col or "deposit" in col:
                credit_idx = i
            elif "amount" in col or "value" in col:
                amount_idx = i
            elif "balance" in col:
                balance_idx = i

        # Fallback default positions
        if date_idx == -1 and len(cols) > 0: date_idx = 0
        if narration_idx == -1 and len(cols) > 1: narration_idx = 1

        transactions = []
        for _, row in df.iterrows():
            # Skip empty rows
            if pd.isna(row.iloc[date_idx]) and (narration_idx == -1 or pd.isna(row.iloc[narration_idx])):
                continue

            try:
                raw_date = row.iloc[date_idx]
                narration = str(row.iloc[narration_idx]).strip() if narration_idx != -1 else "Transaction"
                if pd.isna(raw_date) or str(raw_date).strip().lower() in ("date", "total", "grand total", ""):
                    continue

                date_str = cls.parse_date(raw_date)

                # Determine Type & Amount
                amount = 0.0
                txn_type = "debit"

                if debit_idx != -1 and credit_idx != -1:
                    deb_val = cls.clean_amount(row.iloc[debit_idx])
                    cred_val = cls.clean_amount(row.iloc[credit_idx])
                    if cred_val > 0:
                        amount = cred_val
                        txn_type = "credit"
                    else:
                        amount = deb_val
                        txn_type = "debit"
                elif amount_idx != -1:
                    raw_amt = cls.clean_amount(row.iloc[amount_idx])
                    if raw_amt < 0:
                        amount = abs(raw_amt)
                        txn_type = "debit"
                    else:
                        amount = raw_amt
                        txn_type = "credit"
                
                balance = cls.clean_amount(row.iloc[balance_idx]) if balance_idx != -1 else 0.0

                transactions.append({
                    "bank_account_id": bank_account_id,
                    "date": date_str,
                    "narration": narration,
                    "amount": amount,
                    "type": txn_type,
                    "balance": balance
                })
            except Exception as e:
                logger.warning(f"Failed to parse row in DataFrame: {e}")

        return transactions

    @classmethod
    def parse_pdf(cls, file_bytes: bytes, bank_account_id: str) -> List[Dict[str, Any]]:
        """
        Extracts and parses tabular data from PDF files. Falls back to Gemini OCR if needed.
        """
        transactions = []
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    table = page.extract_table()
                    if table:
                        # Convert extracted grid table to DataFrame
                        df = pd.DataFrame(table[1:], columns=table[0])
                        txns = cls._parse_dataframe(df, bank_account_id)
                        transactions.extend(txns)
        except Exception as e:
            logger.error(f"pdfplumber failed: {e}. Falling back to AI extraction.")

        # Fallback: if rule-based extraction yields nothing, trigger Gemini AI parser
        if not transactions:
            logger.info("Triggering Gemini AI fallback for PDF statement parsing.")
            return cls.parse_via_gemini_fallback(file_bytes, "application/pdf", bank_account_id)

        return transactions

    @classmethod
    def parse_image(cls, file_bytes: bytes, bank_account_id: str) -> List[Dict[str, Any]]:
        """
        Parses statement image files (PNG, JPG) using the server-side Gemini client.
        """
        return cls.parse_via_gemini_fallback(file_bytes, "image/jpeg", bank_account_id)

    @classmethod
    def parse_via_gemini_fallback(cls, file_bytes: bytes, mime_type: str, bank_account_id: str) -> List[Dict[str, Any]]:
        """
        Uses Gemini Vision API to structure transactions from PDFs/Images.
        """
        try:
            # If pdf, we should extract the first few pages or convert to base64
            # Gemini 2.5 Flash can read PDFs directly as well!
            base64_data = base64.b64encode(file_bytes).decode('utf-8')
            
            prompt = """
            You are an expert AI Accounting bot. Your task is to extract bank transactions from this bank statement.
            Provide the transactions in strict JSON format as an array under the key 'transactions'.
            Each transaction MUST contain the following fields exactly:
            - date: in YYYY-MM-DD format
            - narration: description of transaction
            - amount: floating point absolute number
            - type: either 'credit' or 'debit'
            - balance: floating point current running balance (use 0 if not present)

            Double check calculations and ensure only valid transactions are returned. Do not include metadata, headers, or totals.
            """
            
            # Use gemini_extract_json helper
            extracted = gemini_extract_json(
                image_b64=base64_data,
                mime_type=mime_type,
                prompt=prompt,
                model="gemini-2.5-flash"
            )
            
            raw_txns = extracted.get("transactions", [])
            transactions = []
            for t in raw_txns:
                transactions.append({
                    "bank_account_id": bank_account_id,
                    "date": cls.parse_date(t.get("date")),
                    "narration": str(t.get("narration", "")),
                    "amount": float(t.get("amount", 0.0)),
                    "type": str(t.get("type", "debit")).lower(),
                    "balance": float(t.get("balance", 0.0))
                })
            return transactions
        except Exception as e:
            logger.error(f"Gemini statement extraction failed: {e}")
            return []
