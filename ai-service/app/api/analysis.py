from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from app.core.auth import current_token
from app.schemas.payroll import AnalyzeRequest
from app.services.analysis import analyze_records

router = APIRouter(prefix="/api/ai", dependencies=[Depends(current_token)])


@router.post("/analyze")
def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        request = AnalyzeRequest.model_validate(payload)
    except (ValidationError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Malformed payroll records") from exc
    return analyze_records(request)
