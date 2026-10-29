"""Payroll review service: fixed rules plus an OpenAI check. Scores are educational, not fraud or statutory findings."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analysis, chat, health
from app.core import config

app = FastAPI(title=config.TITLE, description=config.DESCRIPTION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=config.CORS_METHODS,
    allow_headers=config.CORS_HEADERS,
)
app.include_router(health.router)
app.include_router(analysis.router)
app.include_router(chat.router)
