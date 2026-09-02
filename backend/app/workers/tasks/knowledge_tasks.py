import asyncio
import uuid

from app.services.knowledge_processing import process_knowledge_document
from app.workers.celery_app import celery_app


@celery_app.task(name="knowledge.process_document")
def process_document_task(document_id: str, raw_text: str | None = None) -> None:
    """
    Redis-backed equivalent of the BackgroundTasks dispatch currently used
    by the /knowledge routes. Not wired into the API yet — routes switch to
    `process_document_task.delay(...)` once Redis is provisioned (Phase 05).
    Both paths call the same process_knowledge_document pipeline.
    """
    asyncio.run(process_knowledge_document(uuid.UUID(document_id), raw_text))
