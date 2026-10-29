from openai import OpenAI

from app.core import config

_client: OpenAI | None = None


def is_configured() -> bool:
    return bool(config.OPENAI_API_KEY)


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY, timeout=config.OPENAI_TIMEOUT_SECONDS, max_retries=1)
    return _client
