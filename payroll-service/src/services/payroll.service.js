const repository = require('../repositories/payroll.repository');
const { fetchEmployee } = require('./employee.client');
const HttpError = require('../utils/http-error');
const { computeDeductions, round2 } = require('./ph-deductions');

const CSV_COLUMNS = ['id', 'employeeId', 'employeeCode', 'fullName', 'period', 'baseSalary', 'overtimeHours', 'overtimePay', 'grossPay', 'sss', 'philhealth', 'pagibig', 'taxableIncome', 'withholdingTax', 'otherDeductions', 'deductions', 'netPay', 'createdAt'];

function listRuns() {
  return repository.findAll();
}

async function runPayroll(body, token) {
  const { employeeId, period, overtimeHours, deductions } = body || {};
  if (!Number.isInteger(Number(employeeId)) || Number(employeeId) <= 0 ||
      typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
      typeof overtimeHours !== 'number' || !Number.isFinite(overtimeHours) || overtimeHours < 0 || overtimeHours > 100 ||
      typeof deductions !== 'number' || !Number.isFinite(deductions) || deductions < 0) {
    throw new HttpError(400, 'Provide a positive employeeId, YYYY-MM period, overtimeHours from 0 to 100, and nonnegative deductions');
  }

  const employee = await fetchEmployee(employeeId, token);
  const base = Number(employee.baseSalary);
  if (!Number.isFinite(base) || base <= 0) throw new HttpError(502, 'Employee service returned invalid salary data');

  const baseSalary = round2(base);
  const grossPay = round2(base + (base / 160 * 1.25 * overtimeHours));
  const breakdown = computeDeductions({ baseSalary, grossPay, otherDeductions: deductions });
  if (breakdown.totalDeductions > grossPay) throw new HttpError(400, 'Deductions cannot exceed gross pay');

  const record = await repository.insertUnique(Number(employeeId), period, () => ({
    id: `${period}-${Number(employeeId)}-${Date.now()}`,
    employeeId: Number(employeeId),
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    period,
    baseSalary,
    overtimeHours,
    overtimePay: round2(grossPay - baseSalary),
    grossPay,
    sss: breakdown.sss,
    philhealth: breakdown.philhealth,
    pagibig: breakdown.pagibig,
    taxableIncome: breakdown.taxableIncome,
    withholdingTax: breakdown.withholdingTax,
    otherDeductions: breakdown.otherDeductions,
    deductions: breakdown.totalDeductions,
    netPay: round2(grossPay - breakdown.totalDeductions),
    createdAt: new Date().toISOString()
  }));
  if (!record) throw new HttpError(409, 'Payroll already exists for this employee and period');
  return record;
}

async function exportRun(id) {
  const record = await repository.findById(id);
  if (!record) throw new HttpError(404, 'Payroll record not found');
  return {
    filename: `payroll-${record.id}.csv`,
    content: `${CSV_COLUMNS.join(',')}\n` +
      CSV_COLUMNS.map(column => `"${String(record[column] ?? '').replaceAll('"', '""')}"`).join(',') + '\n'
  };
}

module.exports = { listRuns, runPayroll, exportRun };
