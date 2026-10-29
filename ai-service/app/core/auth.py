import jwt
from fastapi import Header, HTTPException

from app.core import config


def current_token(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: the caller's token, checked locally.

    The token is a signed JWT issued by employee-service. It is verified here with the shared secret,
    so no call to employee-service is needed. Only HS256 is accepted and the expiry is enforced.
    """
    parts = (authorization or "").split(" ", 1)
    token = parts[1].strip() if len(parts) == 2 and parts[0].lower() == "bearer" else ""
    if not token or len(token) > 2048:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        claims = jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms=["HS256"],
            issuer=config.JWT_ISSUER,
            audience=config.JWT_AUDIENCE,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Sign in required") from exc
    if not claims.get("email") or not claims.get("role"):
        raise HTTPException(status_code=401, detail="Sign in required")
    return token
