import os
import tempfile
from fastapi import FastAPI, File, UploadFile
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling_core.types.doc.base import ImageRefMode

app = FastAPI()

# Configure Docling to extract images bounding boxes and generate bitmaps
pipeline_options = PdfPipelineOptions()
pipeline_options.generate_picture_images = True

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)

@app.post("/extract")
async def extract_pdf(file: UploadFile = File(...)):
    # Docling requires a physical file path or a specialized stream to run vision models.
    # The safest way to handle FastAPI bytes is to dump them into a secure temp file.
    contents = await file.read()
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        # Run IBM Docling ML Models to reconstruct exact structural layout + graphics
        result = converter.convert(tmp_path)
        
        # Export as clean Markdown natively retaining headers, lists, italics, and structure
        # Crucially, embedding images natively as Base64 payload!
        md_text = result.document.export_to_markdown(image_mode=ImageRefMode.EMBEDDED)
        
    except Exception as e:
        md_text = f"Docling Extraction Error: {e}"
    finally:
        # Clean up the large temp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {"text": md_text}
