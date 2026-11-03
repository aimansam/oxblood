"""Player consoles through Apache Guacamole: each player gets their own login on the team's workstation."""

from __future__ import annotations

import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import TokenData
from app.core.config import settings
from app.db import models as catalog_models
from app.db.models import User
from app.db.models_drill import DrillEvent
from app.runners.adapter import SeedSpec
from app.services import matches
from app.services.guacamole import (
    GuacamoleConfig,
    GuacamoleError,
    launch_url,
    linux_username,
    rdp_connection,
    session_password,
)

ACCESS_SEED_KEY = "access_seed"


def guacamole_config() -> GuacamoleConfig | None:
    """The gateway settings, or None when players should keep using the Proxmox console."""
    secret = (
        settings.guacamole_json_secret.get_secret_value()
        if settings.guacamole_json_secret
        else None
    )
    try:
        return GuacamoleConfig.from_settings(settings.guacamole_url, secret)
    except GuacamoleError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def is_rdp_workstation(asset: catalog_models.Asset) -> bool:
    """The GUI images (Kali, Blue) run xrdp; those are the machines a player works from."""
    return "xrdp" in str(asset.template or "").lower()


async def _access_seed(db: AsyncSession, drill) -> str:
    """One secret per exercise, from which each player's password on each machine is derived."""
    env = dict(drill.environment_config or {})
    seed = env.get(ACCESS_SEED_KEY)
    if not seed:
        seed = secrets.token_hex(16)
        env[ACCESS_SEED_KEY] = seed
        drill.environment_config = env
        await db.flush()
    return str(seed)


async def player_console(
    db: AsyncSession,
    *,
    drill,
    asset: catalog_models.Asset,
    token: TokenData,
    side: str,
    adapter,
    config: GuacamoleConfig,
) -> dict:
    """Prepare the player's own account on the machine and return a link that opens it in the browser."""
    if not is_rdp_workstation(asset):
        raise HTTPException(
            status_code=409,
            detail="This machine is not opened from the browser. Work from your team's workstation.",
        )
    vmid, node, host = asset.pve_vmid, asset.pve_node, asset.pve_ip
    if vmid is None or not node or not host:
        raise HTTPException(
            status_code=409, detail="The machine has no address yet. Try again in a moment."
        )
    if await matches.match_for_viewer(db, drill, token) > 1:
        # Range copies reuse the same addresses behind different VLANs; the gateway cannot tell them apart yet.
        raise HTTPException(
            status_code=409,
            detail="Browser access for this match's range copy is not available yet.",
        )
    user = (await db.execute(select(User).where(User.sub == token.sub))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=403, detail="Your account was not found.")

    login = linux_username(token.sub)
    password = session_password(await _access_seed(db, drill), asset.id, user.id)
    try:
        await adapter.apply_guest_seed(
            int(vmid),
            node,
            SeedSpec(
                role=asset.role,
                runcmd=[
                    f"id -u {login} >/dev/null 2>&1 || useradd -m -s /bin/bash {login}",
                    f"echo '{login}:{password}' | chpasswd",
                    f"usermod -aG sudo {login} 2>/dev/null || true",
                ],
            ),
        )
    except Exception as exc:  # noqa: BLE001 - guest agent failures vary
        raise HTTPException(
            status_code=502, detail=f"Could not prepare your session on the machine: {exc}"
        ) from exc

    label = asset.role.replace("_", " ")
    url, expires = launch_url(config, token.sub, {label: rdp_connection(host, login, password)})
    db.add(
        DrillEvent(
            drill_id=drill.id,
            kind="access",
            title="Console opened",
            detail=asset.role,
            side=side,
            actor=token.sub,
        )
    )
    await db.commit()
    return {
        "asset_id": asset.id,
        "role": asset.role,
        "side": side,
        "launch_url": url,
        "expires_at_ms": expires,
        "viewer": "guacamole",
        "message": "Opening your own session on the workstation.",
    }
