from fastapi import APIRouter

from app.api.routes import creators, health, knowledge

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(creators.router)
api_router.include_router(knowledge.router)
