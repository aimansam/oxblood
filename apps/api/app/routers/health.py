"""Liveness, readiness, and metrics endpoints."""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, HTTPException, Response, status
from pydantic import BaseModel

from app import __version__
from app.observability import render_latest

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    env: str


class ReadinessResponse(BaseModel):
    status: str
    checks: dict[str, str]


@router.get("/healthz", response_model=HealthResponse, summary="Liveness probe")
@router.api_route("/healthz", methods=["HEAD"], include_in_schema=False)
@router.api_route(
    "/api/healthz", methods=["GET", "HEAD"], response_model=HealthResponse, include_in_schema=False
)
async def healthz() -> HealthResponse:
    """Return 200 if the process is alive. Used by Docker / Traefik."""
    from app.core.config import settings

    return HealthResponse(status="ok", version=__version__, env=settings.env)


@router.get("/readyz", response_model=ReadinessResponse, summary="Readiness probe")
@router.get("/api/readyz", response_model=ReadinessResponse, include_in_schema=False)
async def readyz() -> ReadinessResponse:
    """Return 200 if all critical dependencies are reachable."""

    checks: dict[str, str] = {}

    # DB check (lazy import — keeps /healthz fast)
    try:
        from app.services.db import ping_db

        await ping_db()
        checks["postgres"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["postgres"] = f"fail: {exc.__class__.__name__}"

    try:
        from app.services.cache import ping_redis

        await ping_redis()
        checks["redis"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = f"fail: {exc.__class__.__name__}"

    status = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return ReadinessResponse(status=status, checks=checks)


@router.get(
    "/metrics",
    summary="Prometheus metrics",
    response_class=Response,
)
async def metrics(authorization: str | None = Header(default=None)) -> Response:
    """Prometheus exposition format. Scrape with /metrics every 15s.

    Open by default, for the internal Docker network. The API also serves the web UI on its
    public port, so on an exposed deployment set ``OXBLOOD_METRICS_TOKEN``: callers must then
    send ``Authorization: Bearer <token>`` (Prometheus: ``authorization.credentials_file``).
    """
    from app.core.config import settings

    token = settings.metrics_token
    if token is not None and token.get_secret_value():
        expected = f"Bearer {token.get_secret_value()}"
        if not hmac.compare_digest((authorization or "").encode(), expected.encode()):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="metrics require a bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )
    body, content_type = render_latest()
    return Response(content=body, media_type=content_type)
