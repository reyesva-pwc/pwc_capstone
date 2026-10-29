// Philippine statutory rates (employee share, monthly). Verify against SSS, PhilHealth, Pag-IBIG and BIR before real use.
const SSS = { rate: 0.05, minCredit: 5000, maxCredit: 35000, step: 500 };
const PHILHEALTH = { rate: 0.025, floor: 10000, ceiling: 100000 };
const PAGIBIG = { rate: 0.02, lowRate: 0.01, lowThreshold: 1500, maxFundSalary: 10000 };

// BIR monthly withholding tax on compensation (TRAIN law, 2023 onwards): tax = base + rate * (taxable - from)
const TAX_BRACKETS = [
  { from: 20833, base: 0, rate: 0.15 },
  { from: 33333, base: 1875, rate: 0.20 },
  { from: 66667, base: 8541.80, rate: 0.25 },
  { from: 166667, base: 33541.80, rate: 0.30 },
  { from: 666667, base: 183541.80, rate: 0.35 }
];

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

function sssContribution(monthlySalary) {
  const credit = Math.min(SSS.maxCredit, Math.max(SSS.minCredit, Math.round(monthlySalary / SSS.step) * SSS.step));
  return round2(credit * SSS.rate);
}

function philhealthContribution(monthlySalary) {
  const basis = Math.min(PHILHEALTH.ceiling, Math.max(PHILHEALTH.floor, monthlySalary));
  return round2(basis * PHILHEALTH.rate);
}

function pagibigContribution(monthlySalary) {
  if (monthlySalary <= PAGIBIG.lowThreshold) return round2(monthlySalary * PAGIBIG.lowRate);
  return round2(Math.min(monthlySalary, PAGIBIG.maxFundSalary) * PAGIBIG.rate);
}

function withholdingTax(taxableIncome) {
  const bracket = [...TAX_BRACKETS].reverse().find(item => taxableIncome > item.from);
  if (!bracket) return 0;
  return round2(bracket.base + bracket.rate * (taxableIncome - bracket.from));
}

// Contributions are based on basic salary; tax is on gross pay (basic + overtime) minus the contributions.
function computeDeductions({ baseSalary, grossPay, otherDeductions }) {
  const sss = sssContribution(baseSalary);
  const philhealth = philhealthContribution(baseSalary);
  const pagibig = pagibigContribution(baseSalary);
  const totalContributions = round2(sss + philhealth + pagibig);
  const taxableIncome = round2(Math.max(0, grossPay - totalContributions));
  const tax = withholdingTax(taxableIncome);
  const other = round2(otherDeductions);
  const totalDeductions = round2(totalContributions + tax + other);
  return { sss, philhealth, pagibig, totalContributions, taxableIncome, withholdingTax: tax, otherDeductions: other, totalDeductions };
}

module.exports = { computeDeductions, round2 };
