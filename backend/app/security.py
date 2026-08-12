from secrets import compare_digest
from typing import Annotated

from fastapi import Header, HTTPException, status

from app.config import settings


def require_api_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
    if x_api_key is None or not compare_digest(
        x_api_key.encode(), settings.backend_api_key.encode()
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
