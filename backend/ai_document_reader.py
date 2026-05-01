import os, io, base64, mimetypes
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from backend.dependencies import get_current_user

router = APIRouter(prefix="/api/ai", tags=["AI Document Reader"])

def _get_gemini_model():
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured.")
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
    filename  = file.filename or ""
    mime_type = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    ext       = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    model = _get_gemini_model()

    # ── Excel / CSV → convert to text first ──────────────────────────────
    if ext in ("xlsx", "xls", "xlsm"):
        try:
            import openpyxl
            wb  = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
            lines = []
            for sheet in wb.sheetnames:
                ws = wb[sheet]
                lines.append(f"Sheet: {sheet}")
                for row in ws.iter_rows(values_only=True):
                    lines.append("\t".join("" if v is None else str(v) for v in row))
            text_content = "\n".join(lines)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse Excel file: {e}")

        prompt = (
            "You are a financial document analyst. The following is spreadsheet data.\n"
            "Provide: 1) A clear summary  2) Key totals/figures  3) Trends or anomalies  "
            "4) Actionable insights. Be concise and structured.\n\n"
            f"{text_content[:50000]}"   # Gemini free context limit safety
        )
        response = await model.generate_content_async(prompt)
        return {"filename": filename, "analysis": response.text}

    if ext == "csv":
        try:
            text_content = contents.decode("utf-8", errors="replace")
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not read CSV: {e}")

        prompt = (
            "You are a data analyst. The following is CSV data. "
            "Summarise it clearly: key columns, totals, patterns, and insights.\n\n"
            f"{text_content[:50000]}"
        )
        response = await model.generate_content_async(prompt)
        return {"filename": filename, "analysis": response.text}

    # ── PDF / Images → send as base64 inline to Gemini ───────────────────
    if ext == "pdf":
        mime_type = "application/pdf"
    elif ext in ("jpg", "jpeg"):
        mime_type = "image/jpeg"
    elif ext == "png":
        mime_type = "image/png"
    elif ext in ("webp",):
        mime_type = "image/webp"

    supported = ("application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif")
    if mime_type not in supported:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{mime_type}'. Supported: PDF, Excel, CSV, JPG, PNG."
        )

    b64 = base64.b64encode(contents).decode("utf-8")

    prompt = (
        "You are a smart document analyst. Carefully read this document and provide:\n"
        "1) Document type and purpose\n"
        "2) All key data, figures, totals, dates, and party names\n"
        "3) A clear structured summary\n"
        "4) Any important observations or anomalies\n"
        "Be thorough but well-organised."
    )

    response = await model.generate_content_async([
        {"inline_data": {"mime_type": mime_type, "data": b64}},
        prompt,
    ])
    return {"filename": filename, "analysis": response.text}
