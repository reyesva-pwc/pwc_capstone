# Offline payroll analysis service

This local FastAPI service reviews payroll records with explicit deterministic checks and a reproducible scikit-learn IsolationForest fitted on 250 synthetic fictional feature rows. It makes no external AI or cloud calls. Anomaly scores are educational and are not fraud or statutory determinations.

## Requirements

Use Python 3.11 or 3.12.

## VS Code terminal (PowerShell)

From the repository root:

```powershell
cd ai-service
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

If Python 3.12 is installed instead, use `py -3.12 -m venv .venv`.

Check health in a second terminal:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

Expected response: `status=ok`, `mode=offline`.

## Analyze payroll records

The analyzer expects `baseSalary`, `overtimeHours`, `overtimePay`, `grossPay`, `deductions`, and `netPay` per record. It returns HTTP 400 for malformed records.

```powershell
$body = '{"records":[{"id":"2026-10-1","baseSalary":30000,"overtimeHours":8,"overtimePay":1875,"grossPay":31875,"deductions":500,"netPay":31375}]}'
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/ai/analyze -ContentType 'application/json' -Body $body
```

The API allows browser requests from `http://localhost:5173`.
