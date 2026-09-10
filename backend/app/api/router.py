from fastapi import APIRouter

from app.api.routes import (
    creator_face,
    creators,
    environment_setups,
    generation,
    health,
    hooks,
    knowledge,
    links,
    media,
    projects,
    script,
    storyboard,
    tanglish,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(creators.router)
api_router.include_router(creator_face.router)
api_router.include_router(knowledge.router)
api_router.include_router(links.router)
api_router.include_router(environment_setups.router)
api_router.include_router(projects.router)
api_router.include_router(hooks.router)
api_router.include_router(script.router)
api_router.include_router(tanglish.router)
api_router.include_router(storyboard.router)
api_router.include_router(generation.router)
api_router.include_router(media.router)
