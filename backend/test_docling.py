from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat

conv = DocumentConverter()
res = conv.convert('../Book-Test-Download.pdf')
doc = res.document

anchors = {}
try:
    for item, level in doc.iterate_items():
        if hasattr(item, "text") and item.text:
             if hasattr(item, "prov") and len(item.prov) > 0:
                  page = item.prov[0].page_no
                  if str(page) not in anchors:
                      anchors[str(page)] = item.text[:30].strip()
    print("SUCCESS ANCHORS:", anchors)
except Exception as e:
    print("ERROR:", e)
