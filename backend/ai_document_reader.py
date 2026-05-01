import os, io, base64
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from backend.dependencies import get_current_user

router = APIRouter(prefix="/api/ai", tags=["AI Document Reader"])


# ── Gemini client (PDF text, Excel, CSV) ─────────────────────────────────────
def _get_gemini_model():
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured on the server."
        )
    try:
        import google.generativeai as genai
        genai.configure(api_key=key)
        return genai.GenerativeModel("gemini-2.0-flash")
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="google-generativeai package not installed."
        )


# ── Groq vision — single image ────────────────────────────────────────────────
async def _groq_vision(image_b64: str, mime_type: str, prompt: str) -> str:
    import httpx
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on the server.")

    payload = {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
                {"type": "text", "text": prompt},
            ],
        }],
        "max_tokens": 2048,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Groq quota exceeded. Please wait a moment and try again.")
    if resp.status_code != 200:
        raise HTTPException(status_code=422, detail=f"Groq API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


# ── Groq vision — multiple page images (scanned PDF) ─────────────────────────
async def _groq_vision_multipage(page_images_b64: list, prompt: str) -> str:
    import httpx
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on the server.")

    content = []
    for img_b64, mime in page_images_b64:
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}})
    content.append({"type": "text", "text": prompt})

    payload = {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 2048,
    }
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Groq quota exceeded. Please wait a moment and try again.")
    if resp.status_code != 200:
        raise HTTPException(status_code=422, detail=f"Groq API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


# ── Main route ────────────────────────────────────────────────────────────────
@router.post("/analyze-document")
async def analyze_document(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    contents = await file.read()
    filename = file.filename or "uploaded_file"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # ── Excel (.xlsx / .xlsm) → Gemini ───────────────────────────────────────
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

        model = _get_gemini_model()
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

    # ── Excel (.xls) → Gemini ─────────────────────────────────────────────────
    if ext == "xls":
        try:
            import pandas as pd
            df = pd.read_excel(io.BytesIO(contents), engine="xlrd")
            text_content = df.to_string(index=False)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse .xls file: {e}")

        model = _get_gemini_model()
        prompt = (
            "You are a data analyst. Below is spreadsheet data.\n"
            "Summarise it clearly: key columns, totals, patterns, and insights.\n\n"
            f"{text_content[:40000]}"
        )
        response = await model.generate_content_async(prompt)
        return {"filename": filename, "analysis": response.text}

    # ── CSV → Gemini ──────────────────────────────────────────────────────────
    if ext == "csv":
        try:
            text_content = contents.decode("utf-8", errors="replace")
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not read CSV: {e}")

        model = _get_gemini_model()
        prompt = (
            "You are a data analyst. Below is CSV data.\n"
            "Summarise it: key columns, totals, patterns, and insights.\n\n"
            f"{text_content[:40000]}"
        )
        response = await model.generate_content_async(prompt)
        return {"filename": filename, "analysis": response.text}

    # ── PDF → Gemini (text PDF) or Groq (scanned PDF) ────────────────────────
    if ext == "pdf":
        try:
            import pdfplumber
            extracted_pages = []
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                for i, page in enumerate(pdf.pages[:30]):
                    text = page.extract_text()
                    if text and text.strip():
                        extracted_pages.append(f"--- Page {i+1} ---\n{text.strip()}")
            text_content = "\n\n".join(extracted_pages)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not read PDF: {e}")

        if text_content.strip():
            # Normal text-based PDF → Gemini
            model = _get_gemini_model()
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
        else:
            # Scanned PDF (no text layer) → render pages as images → Groq vision
            try:
                from PIL import Image as PILImage
                page_images_b64 = []
                with pdfplumber.open(io.BytesIO(contents)) as pdf:
                    for page in pdf.pages[:4]:   # max 4 pages for Groq
                        pil_img = page.to_image(resolution=150).original
                        if pil_img.mode not in ("RGB", "L"):
                            pil_img = pil_img.convert("RGB")
                        buf = io.BytesIO()
                        pil_img.save(buf, format="JPEG", quality=85)
                        img_b64 = base64.b64encode(buf.getvalue()).decode()
                        page_images_b64.append((img_b64, "image/jpeg"))

                if not page_images_b64:
                    raise HTTPException(status_code=422, detail="No pages could be rendered from this PDF.")

                prompt = (
                    "You are a document analyst. These are pages from a scanned PDF document.\n"
                    "Please read carefully and provide:\n"
                    "1. Document type and purpose\n"
                    "2. All key data, figures, dates, and names\n"
                    "3. A structured summary\n"
                    "4. Important observations"
                )
                analysis = await _groq_vision_multipage(page_images_b64, prompt)
                return {"filename": filename, "analysis": analysis}
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=422, detail=f"Scanned PDF could not be processed: {e}")

    # ── Images (JPG, PNG, WEBP) → Groq vision ────────────────────────────────
    if ext in ("jpg", "jpeg", "png", "webp", "gif"):
        try:
            from PIL import Image as PILImage
            img = PILImage.open(io.BytesIO(contents))
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            img_b64 = base64.b64encode(buf.getvalue()).decode()
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
        analysis = await _groq_vision(img_b64, "image/jpeg", prompt)
        return {"filename": filename, "analysis": analysis}

    raise HTTPException(
        status_code=415,
        detail=f"Unsupported file type '.{ext}'. Supported: PDF, Excel (.xlsx/.xls), CSV, JPG, PNG, WEBP."
    )
