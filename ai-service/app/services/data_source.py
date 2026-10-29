"""Loads the live employee and payroll data from the two services that own it."""

import logging
from collections import Counter
from typing import Any

import httpx

from app.core import config

logger = logging.getLogger(__name__)

EMPLOYEE_FIELDS = ("employeeCode", "fullName", "position", "emailAddress", "contactNumber", "baseSalary")
RUN_FIELDS = ("employeeCode", "fullName", "period", "baseSalary", "overtimeHours", "overtimePay", "grossPay",
              "sss", "philhealth", "pagibig", "taxableIncome", "withholdingTax", "otherDeductions",
              "deductions", "netPay")


class DataUnavailable(Exception):
    """Neither data source could be read."""


def _get_list(url: str, token: str) -> list[dict[str, Any]] | None:
    try:
        response = httpx.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=config.DATA_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("Could not load %s: %s", url, type(exc).__name__)
        return None
    return data if isinstance(data, list) else None


def _pick(row: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    return {field: row[field] for field in fields if field in row}


def _summary(employees: list[dict[str, Any]] | None, runs: list[dict[str, Any]] | None) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    if employees is not None:
        summary["employee_count"] = len(employees)
        summary["employees_by_position"] = dict(Counter(e.get("position") for e in employees))
    if runs is not None:
        def total(field: str) -> float:
            return round(sum(float(r.get(field) or 0) for r in runs), 2)

        summary["payroll_run_count"] = len(runs)
        summary["total_gross_pay"] = total("grossPay")
        summary["total_deductions"] = total("deductions")
        summary["total_net_pay"] = total("netPay")
    return summary


def load_snapshot(token: str) -> dict[str, Any]:
    employees = _get_list(f"{config.EMPLOYEE_SERVICE_URL}/api/employees", token)
    runs = _get_list(f"{config.PAYROLL_SERVICE_URL}/api/payroll", token)
    if employees is None and runs is None:
        raise DataUnavailable("Could not load employee or payroll data")

    snapshot: dict[str, Any] = {"summary": _summary(employees, runs)}
    unavailable = []
    if employees is None:
        unavailable.append("employees")
    else:
        snapshot["employees"] = [_pick(e, EMPLOYEE_FIELDS) for e in employees]
    if runs is None:
        unavailable.append("payroll_runs")
    else:
        snapshot["payroll_runs"] = [_pick(r, RUN_FIELDS) for r in runs[-config.CHAT_MAX_RUNS:]]
        if len(runs) > config.CHAT_MAX_RUNS:
            snapshot["payroll_runs_note"] = f"Only the most recent {config.CHAT_MAX_RUNS} of {len(runs)} runs are shown."
    if unavailable:
        snapshot["unavailable_sections"] = unavailable
    return snapshot
