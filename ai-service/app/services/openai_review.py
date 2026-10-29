import json
import logging
from typing import Any

from openai import OpenAIError

from app.core import config
from app.services.openai_client import get_client, is_configured

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You review monthly Philippine payroll records for a payroll officer. "
    "Each record has: baseSalary, overtimeHours, overtimePay, grossPay, deductions, netPay (all in PHP). "
    "Normal pay works like this: overtimePay = baseSalary / 160 * 1.25 * overtimeHours; grossPay = baseSalary + overtimePay; "
    "deductions include SSS, PhilHealth, Pag-IBIG and withholding tax, which together are typically about 8% to 25% of grossPay; "
    "netPay = grossPay - deductions. "
    "Flag a record only if something looks inconsistent or unusual and deserves a human look. "
    "Give a short plain-English reason (under 20 words) for every record, including ones you do not flag. "
    "Return one result per input record, using the same index."
)

RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "payroll_review",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "results": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "index": {"type": "integer"},
                            "flagged": {"type": "boolean"},
                            "reason": {"type": "string"},
                        },
                        "required": ["index", "flagged", "reason"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["results"],
            "additionalProperties": False,
        },
    },
}

class OpenAIReviewError(Exception):
    """Raised for any problem getting a review; the message is safe to show to users."""


def _review_batch(rows: list[dict[str, Any]]) -> dict[int, tuple[bool, str]]:
    try:
        completion = get_client().chat.completions.create(
            model=config.OPENAI_MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps({"records": rows})},
            ],
            response_format=RESPONSE_FORMAT,
        )
    except OpenAIError as exc:
        # Log only the error type and status; never the message, which can echo part of the API key.
        logger.error("OpenAI request failed: %s (status %s)", type(exc).__name__, getattr(exc, "status_code", "n/a"))
        raise OpenAIReviewError("OpenAI request failed") from exc

    message = completion.choices[0].message
    if message.refusal or not message.content:
        raise OpenAIReviewError("OpenAI declined to review these records")
    try:
        parsed = json.loads(message.content)["results"]
        return {int(item["index"]): (bool(item["flagged"]), str(item["reason"]).strip()) for item in parsed}
    except (ValueError, KeyError, TypeError) as exc:
        logger.error("OpenAI returned an unexpected response shape")
        raise OpenAIReviewError("OpenAI returned an unreadable response") from exc


def review_records(rows: list[dict[str, Any]]) -> dict[int, tuple[bool, str]]:
    """Return {index: (flagged, reason)} for every row. Rows hold numbers only, never names."""
    if not is_configured():
        raise OpenAIReviewError("OpenAI is not configured")
    verdicts: dict[int, tuple[bool, str]] = {}
    for start in range(0, len(rows), config.OPENAI_BATCH_SIZE):
        verdicts.update(_review_batch(rows[start:start + config.OPENAI_BATCH_SIZE]))
    return verdicts
