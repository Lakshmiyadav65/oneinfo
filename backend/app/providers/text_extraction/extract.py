import io

from docx import Document
from pypdf import PdfReader

from app.core.errors import ValidationAppError
from app.models.knowledge import KnowledgeSourceType


def extract_text(source_type: KnowledgeSourceType, content: bytes) -> str:
    if source_type == KnowledgeSourceType.pdf:
        return _extract_pdf(content)
    if source_type == KnowledgeSourceType.docx:
        return _extract_docx(content)
    return _extract_plain(content)


def _extract_pdf(content: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(content))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise ValidationAppError("Could not read this PDF file.") from exc
    return "\n\n".join(pages).strip()


def _extract_docx(content: bytes) -> str:
    try:
        document = Document(io.BytesIO(content))
        paragraphs = [p.text for p in document.paragraphs]
    except Exception as exc:
        raise ValidationAppError("Could not read this DOCX file.") from exc
    return "\n".join(paragraphs).strip()


def _extract_plain(content: bytes) -> str:
    try:
        return content.decode("utf-8").strip()
    except UnicodeDecodeError as exc:
        raise ValidationAppError("File must be UTF-8 text.") from exc
