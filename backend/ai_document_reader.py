import os, io
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from backend.dependencies import get_current_user

router = APIRouter(prefix="/api/ai", tags=["AI Document Reader"])


def _get_gemini_model():
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server.")
    try:
        import google.generativeai as genai
        genai.configure(api_key=key)
        return genai.GenerativeModel("gemini-1.5-flash")
    except ImportError:
        raise HTTPException(status_code=500, detail="google-generativeai package not installed.")


@router.post("/analyze-document")
async def analyze_document(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    contents = await file.read()
    filename  = file.filename or "uploaded_file"
    ext       = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    model = _get_gemini_model()

    # ── Excel (.xlsx / .xls / .xlsm) → convert to text via openpyxl ──────
    if ext in ("xlsx", "xlsm"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
            lines = []
            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                lines.append(f"\n--- Sheet: {sheet_name} ---")
                for row in ws.iter_rows(values_only=True):
                    row_text = "\t".join("" if v is None else str(v) for v in row)
                    if row_text.strip():
                        lines.append(row_text)
            text_content = "\n".join(lines)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse Excel file: {e}")

        prompt = (
            "You are a financial document analyst. Below is spreadsheet data.\n"
            "Please provide:\n"
            "1. A clear summary of what this spreadsheet contains\n"
            "2. All key figures, totals, and important numbers\n"
            "3. Any trends or patterns you notice\n"
            "4. Actionable insights or observations\n\n"
            f"{text_content[:40000]}"
        )
        response = await model.generate_content_async(prompt)
        return {"filename": filename, "analysis": response.text}

    if ext == "xls":
        try:
            import pandas as pd
            df = pd.read_excel(io.BytesIO(contents), engine="xlrd")
            text_content = df.to_string(index=False)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse .xls file: {e}")

        prompt = (
            "You are a data analyst. Below is spreadsheet data.\n"
            "Summarise it clearly: key columns, totals, patterns, and insights.\n\n"
            f"{text_content[:40000]}"
        )
        response = await model.generate_content_async(prompt)
        return {"filename": filename, "analysis": response.text}

    # ── CSV → plain text ──────────────────────────────────────────────────
    if ext == "csv":
        try:
            text_content = contents.decode("utf-8", errors="replace")
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not read CSV: {e}")

        prompt = (
            "You are a data analyst. Below is CSV data.\n"
            "Summarise it: key columns, totals, patterns, and insights.\n\n"
            f"{text_content[:40000]}"
        )
        response = await model.generate_content_async(prompt)
        return {"filename": filename, "analysis": response.text}

    # ── PDF → extract text with pdfplumber, then send to Gemini ──────────
    if ext == "pdf":
        try:
            import pdfplumber
            extracted_pages = []
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                for i, page in enumerate(pdf.pages[:30]):   # max 30 pages
                    text = page.extract_text()
                    if text and text.strip():
                        extracted_pages.append(f"--- Page {i+1} ---\n{text.strip()}")
            text_content = "\n\n".join(extracted_pages)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not read PDF: {e}")

        if not text_content.strip():
            # PDF has no extractable text (scanned image PDF) — use vision
            # google-generativeai 0.8.x accepts PIL Image objects directly
            try:
                from PIL import Image as PILImage
                pil_images = []
                with pdfplumber.open(io.BytesIO(contents)) as pdf:
                    for page in pdf.pages[:5]:
                        # .to_image() returns pdfplumber PageImage; .original is the PIL Image
                        pil_img = page.to_image(resolution=150).original
                        # Ensure RGB so Gemini accepts it
                        if pil_img.mode not in ("RGB", "L"):
                            pil_img = pil_img.convert("RGB")
                        pil_images.append(pil_img)
                if not pil_images:
                    raise HTTPException(status_code=422, detail="No pages could be rendered from this PDF.")
                prompt = (
                    "You are a document analyst. This is a scanned PDF document.\n"
                    "Please read it carefully and provide:\n"
                    "1. Document type and purpose\n"
                    "2. All key data, figures, dates, and names\n"
                    "3. A structured summary\n"
                    "4. Important observations"
                )
                response = await model.generate_content_async(pil_images + [prompt])
                return {"filename": filename, "analysis": response.text}
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=422, detail=f"Scanned PDF could not be processed: {e}")

        prompt = (
            "You are a document analyst. Below is extracted text from a PDF document.\n"
            "Please provide:\n"
            "1. Document type and purpose\n"
            "2. All key data, figures, totals, dates, and party names\n"
            "3. A clear structured summary\n"
            "4. Any important observations or anomalies\n\n"
            f"{text_content[:40000]}"
        )
        response = await model.generate_content_async(prompt)
        return {"filename": filename, "analysis": response.text}

    # ── Images (JPG, PNG, WEBP) → PIL Image → Gemini vision ──────────────
    if ext in ("jpg", "jpeg", "png", "webp", "gif"):
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(contents))
            # Convert to RGB if needed (e.g. RGBA PNG)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not open image: {e}")

        prompt = (
            "You are a document analyst. Look at this image carefully.\n"
            "Please provide:\n"
            "1. What type of document or image this is\n"
            "2. All key data, numbers, dates, names, and amounts visible\n"
            "3. A structured summary of all important information\n"
            "4. Any observations or red flags"
        )
        response = await model.generate_content_async([img, prompt])
        return {"filename": filename, "analysis": response.text}

    raise HTTPException(
        status_code=415,
        detail=f"Unsupported file type '.{ext}'. Supported: PDF, Excel (.xlsx/.xls), CSV, JPG, PNG, WEBP."
    )
