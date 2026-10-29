from fastapi import APIRouter

from app.services.openai_review import is_configured

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "openai" if is_configured() else "rules-only"}
