from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("oneinfo", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_always_eager = settings.celery_task_always_eager
celery_app.autodiscover_tasks(["app.workers.tasks"])
