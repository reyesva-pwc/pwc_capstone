import math

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PayrollRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    baseSalary: float = Field(gt=0)
    overtimeHours: float = Field(ge=0)
    overtimePay: float = Field(ge=0)
    grossPay: float = Field(gt=0)
    deductions: float = Field(ge=0)
    netPay: float = Field(ge=0)

    @model_validator(mode="after")
    def finite_numbers(self) -> "PayrollRecord":
        values = (self.baseSalary, self.overtimeHours, self.overtimePay,
                  self.grossPay, self.deductions, self.netPay)
        if not all(math.isfinite(value) for value in values):
            raise ValueError("payroll values must be finite numbers")
        return self


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    records: list[PayrollRecord]
