from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from app.core.auth import current_token
from app.schemas.chat import ChatRequest
from app.services.chat import ChatError, answer_question

router = APIRouter(prefix="/api/ai")


@router.post("/chat")
def chat(payload: dict[str, Any], token: str = Depends(current_token)) -> dict[str, str]:
    try:
        request = ChatRequest.model_validate(payload)
    except (ValidationError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid chat request") from exc
    try:
        return {"answer": answer_question(request, token)}
    except ChatError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
