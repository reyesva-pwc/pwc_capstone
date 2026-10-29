import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

TITLE = "Payroll AI Review"
DESCRIPTION = "Reviews payroll runs with fixed rules and an OpenAI check. Educational, not fraud or statutory determinations."
CORS_ORIGINS = ["http://localhost:5173"]
CORS_METHODS = ["GET", "POST"]
CORS_HEADERS = ["Content-Type", "Authorization"]
NOTICE = "AI review is educational and is not a fraud or statutory determination."

JWT_SECRET = os.getenv("JWT_SECRET", "")
if len(JWT_SECRET.encode("utf-8")) < 32:
    raise RuntimeError(
        "JWT_SECRET is missing or shorter than 32 characters. Set the same value in ai-service/.env "
        "as in employee-service/.env (see .env.example)."
    )
JWT_ISSUER = "payroll-capstone-employee-service"
JWT_AUDIENCE = "payroll-capstone"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
OPENAI_TIMEOUT_SECONDS = 30.0
OPENAI_BATCH_SIZE = 50

EMPLOYEE_SERVICE_URL = os.getenv("EMPLOYEE_SERVICE_URL", "http://localhost:8081").strip().rstrip("/")
PAYROLL_SERVICE_URL = os.getenv("PAYROLL_SERVICE_URL", "http://localhost:3001").strip().rstrip("/")
DATA_TIMEOUT_SECONDS = 5.0
CHAT_MAX_RUNS = 200
CHAT_MAX_MESSAGES = 12
CHAT_MAX_MESSAGE_CHARS = 1000
