from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.security import require_api_key

probe_app = FastAPI()


@probe_app.get("/probe", dependencies=[Depends(require_api_key)])
def probe() -> dict[str, bool]:
    return {"ok": True}


async def probe_status(headers: dict[str, str | bytes]) -> int:
    transport = ASGITransport(app=probe_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/probe", headers=headers)
    return response.status_code


async def test_no_key_is_rejected():
    assert await probe_status({}) == 401


async def test_wrong_key_is_rejected():
    assert await probe_status({"X-API-Key": "wrong"}) == 401


async def test_prefix_of_the_key_is_rejected():
    assert await probe_status({"X-API-Key": settings.backend_api_key[:-1]}) == 401


async def test_non_ascii_key_is_rejected_without_erroring():
    """Headers travel as latin-1 bytes, so the value reaching us need not be ASCII."""
    assert await probe_status({"X-API-Key": "clé".encode("latin-1")}) == 401


async def test_right_key_is_accepted():
    assert await probe_status({"X-API-Key": settings.backend_api_key}) == 200
