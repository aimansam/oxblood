"""Public settings and service status."""

from __future__ import annotations

from typing import Annotated, Any

import structlog
from fastapi import (
    APIRouter,
    Depends,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Role, require_role
from app.db.session import get_session

log = structlog.get_logger()

# Router-level gate: every endpoint requires an admin token.
router = APIRouter(dependencies=[Depends(require_role(Role.ADMIN))])


# -- service-status aggregator --------------------------------------------
#
# Aggregates PVE / disk / audit recency into a
# single read-only snapshot for the Config tab's "Deployment status"
# panel. Authenticated (admin or lead) so we don't leak env-derived
# signals to anonymous callers, but no role gate beyond login -- the
# existing probe endpoints have the same posture.

from app.services import service_status as service_status_svc  # noqa: E402


@router.get(
    "/public-settings",
    summary="Non-secret runtime settings for the Setup page (admin only)",
)
async def get_public_settings() -> dict[str, Any]:
    """Return display-only, non-secret settings.

    Everything here is safe to render in the portal: token TTL,
    timeouts, sync intervals, scenario dirs, CORS origins. Secrets
    (PVE creds) are never included — PVE creds live behind
    GET /admin/pve-config (masked), the rest are env-only.
    """
    from app.core.config import settings as _settings

    return {
        "env": _settings.env,
        "login_token_ttl_s": _settings.login_token_ttl_s,
        "drill_timeout_enabled": _settings.drill_timeout_enabled,
        "drill_timeout_min": _settings.drill_timeout_min,
        "pve_sync_interval_sec": _settings.pve_sync_interval_sec,
        "pve_clone_storage": _settings.proxmox.clone_storage,
        "pve_seed_snippet_storage": _settings.proxmox.seed_snippet_storage,
        "orphan_janitor_enabled": _settings.orphan_janitor_enabled,
        "scenarios_dir": _settings.scenarios_dir,
        "cors_allow_origins": _settings.cors_allow_origins,
    }


@router.get(
    "/service-status",
    summary="Aggregated runtime status for the Config tab's deployment panel",
)
async def get_service_status(
    db: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Read-only aggregator. Fails soft: one bad probe never blocks
    the rest. Polled on every Config tab Refresh.
    """
    return await service_status_svc.get_service_status(db)
