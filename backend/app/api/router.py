from fastapi import APIRouter

from app.api.routes import (
    creators,
    generation,
    health,
    hooks,
    knowledge,
    projects,
    script,
    storyboard,
    tanglish,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(creators.router)
api_router.include_router(knowledge.router)
api_router.include_router(projects.router)
api_router.include_router(hooks.router)
api_router.include_router(script.router)
api_router.include_router(tanglish.router)
api_router.include_router(storyboard.router)
api_router.include_router(generation.router)
