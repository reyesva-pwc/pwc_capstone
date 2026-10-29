from typing import Any

from app.core.config import NOTICE
from app.schemas.payroll import AnalyzeRequest
from app.services.openai_review import OpenAIReviewError, review_records

NUMERIC_FIELDS = ("baseSalary", "overtimeHours", "overtimePay", "grossPay", "deductions", "netPay")


def rule_warnings(record) -> list[str]:
    warnings = []
    if record.overtimeHours > 24:
        warnings.append("overtime_hours_exceed_24")
    if record.deductions > 0.20 * record.grossPay:
        warnings.append("deductions_exceed_20_percent_of_gross")
    if abs((record.grossPay - record.deductions) - record.netPay) > 0.01:
        warnings.append("gross_minus_deductions_does_not_match_net")
    return warnings


def analyze_records(request: AnalyzeRequest) -> dict[str, Any]:
    verdicts: dict[int, tuple[bool, str]] = {}
    ai_error = None
    if request.records:
        rows = [{"index": i, **{field: getattr(record, field) for field in NUMERIC_FIELDS}}
                for i, record in enumerate(request.records)]
        try:
            verdicts = review_records(rows)
        except OpenAIReviewError as exc:
            ai_error = str(exc)

    results = []
    for i, record in enumerate(request.records):
        warnings = rule_warnings(record)
        verdict = verdicts.get(i)
        ai_flagged = verdict[0] if verdict else None
        results.append({
            "id": record.model_extra.get("id") if record.model_extra else None,
            "status": "review" if ai_flagged or warnings else "normal",
            "ai_flagged": ai_flagged,
            "ai_reason": verdict[1] if verdict else None,
            "warnings": warnings,
        })
    return {
        "count": len(results),
        "results": results,
        "ai_available": ai_error is None,
        "ai_error": ai_error,
        "notice": NOTICE,
    }
