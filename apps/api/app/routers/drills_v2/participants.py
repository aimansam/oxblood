"""Participant roster and announcement endpoints."""

from __future__ import annotations

import logging
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Role, TokenData, require_role
from app.db.models import User
from app.db.models_drill import (
    DrillEvent,
    DrillParticipant,
    DrillStatus,
    DrillTeam,
)
from app.db.session import get_session
from app.services import teams as team_service
from app.services.account_cleanup import KEEP_KEY, exercise_accounts, purge_exercise_accounts
from app.services.drill_service import (
    add_participant,
    create_announcement,
    get_drill,
    list_drill_announcements,
    list_drill_participants,
    remove_participant,
)
from app.services.users import create_user

from .schemas import AnnouncementCreate, CandidateListOut, ParticipantAdd, ParticipantListOut

router = APIRouter()
log = logging.getLogger("app.routers.drills_v2")


# ============================================================================
# Participants
# ============================================================================


@router.get(
    "/{drill_id}/participants", response_model=ParticipantListOut, response_model_exclude_unset=True
)
async def get_participants(
    drill_id: int,
    db: AsyncSession = Depends(get_session),
    token: TokenData = Depends(require_role(Role.ADMIN, Role.LEAD)),
):
    """Get all participants in a drill."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    participants = await list_drill_participants(db, drill_id)
    user_ids = [p.user_id for p in participants]
    users_by_id = {}
    if user_ids:
        result = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_by_id = {u.id: u for u in result.scalars().all()}
    return {
        "participants": [
            {
                "id": p.id,
                "user_id": p.user_id,
                "sub": users_by_id[p.user_id].sub if p.user_id in users_by_id else None,
                "username": users_by_id[p.user_id].sub if p.user_id in users_by_id else None,
                "team_id": p.team_id,
                "role": p.role,
                "status": p.status,
                "joined_at": p.joined_at.isoformat() if p.joined_at else None,
                "last_login_at": (
                    users_by_id[p.user_id].last_login_at.isoformat()  # type: ignore[union-attr]
                    if p.user_id in users_by_id and users_by_id[p.user_id].last_login_at
                    else None
                ),
            }
            for p in participants
        ]
    }


@router.get(
    "/{drill_id}/roster-candidates",
    response_model=CandidateListOut,
    response_model_exclude_unset=True,
)
async def get_roster_candidates(
    drill_id: int,
    db: AsyncSession = Depends(get_session),
    token: TokenData = Depends(require_role(Role.ADMIN, Role.LEAD)),
):
    """Return eligible Red/Blue accounts for the operator roster."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    enrolled_ids = (
        (
            await db.execute(
                select(DrillParticipant.user_id).where(DrillParticipant.drill_id == drill_id)
            )
        )
        .scalars()
        .all()
    )
    users = (
        (
            await db.execute(
                select(User)
                .where(User.role.in_([Role.RED.value, Role.BLUE.value]), User.disabled.is_(False))
                .order_by(User.role, User.sub)
            )
        )
        .scalars()
        .all()
    )
    enrolled = {int(user_id) for user_id in enrolled_ids}
    return {
        "drill_id": drill.id,
        "drill_status": drill.status.value,
        "candidates": [
            {
                "id": user.id,
                "sub": user.sub,
                "role": user.role,
                "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
            }
            for user in users
            if user.id not in enrolled
        ],
    }


@router.post("/{drill_id}/participants")
async def post_participant(
    drill_id: int,
    data: ParticipantAdd,
    db: AsyncSession = Depends(get_session),
    token: TokenData = Depends(require_role(Role.ADMIN, Role.LEAD)),
):
    """Add a participant to a drill."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    if drill.status != DrillStatus.SCHEDULED:
        raise HTTPException(status_code=409, detail="Roster is locked after the drill starts.")
    side = str(data.role or "").lower()
    if side not in {"red", "blue"}:
        raise HTTPException(status_code=422, detail="Participant side must be red or blue.")
    user = await db.get(User, data.user_id)
    if user is None or user.disabled:
        raise HTTPException(status_code=404, detail="Eligible participant account not found")
    if str(user.role or "").lower() != side:
        raise HTTPException(
            status_code=422,
            detail=f"Account {user.sub!r} has role {user.role!r}; enroll it on the matching side.",
        )
    try:
        participant = await add_participant(db, drill_id, data.user_id, data.team_id, side)
        db.add(
            DrillEvent(
                drill_id=drill_id,
                kind="roster",
                title=f"{side.title()} participant enrolled",
                detail=user.sub,
                side=side,
                actor=token.sub,
            )
        )
        await db.commit()
        return {"message": "Participant added", "participant_id": participant.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class BulkPlayers(BaseModel):
    names: list[str] = Field(min_length=1, max_length=40)
    side: str = Field(default="red", pattern="^(red|blue)$")
    team_id: int | None = None


_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _username(name: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".")[:24] or "player"
    candidate, n = base, 1
    while candidate in taken:
        n += 1
        candidate = f"{base}{n}"
    taken.add(candidate)
    return candidate


async def _enroll_new(
    db: AsyncSession,
    drill_id: int,
    name: str,
    side: str,
    team: DrillTeam | None,
    taken: set[str],
    actor: str,
    must_change_password: bool = True,
) -> dict:
    """Create one account for this exercise (marked, so it is destroyed after cleanup) and enroll it."""
    username = _username(name, taken)
    password = "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(12))
    user = await create_user(db, sub=username, password=password, role=side)
    user.created_for_drill_id = drill_id
    user.must_change_password = must_change_password
    db.add(
        DrillParticipant(
            drill_id=drill_id,
            user_id=user.id,
            role=side,
            status="registered",
            drill_team_id=team.id if team else None,
        )
    )
    db.add(
        DrillEvent(
            drill_id=drill_id,
            kind="roster",
            title=f"{side.title()} participant created and enrolled",
            detail=username,
            side=side,
            actor=actor,
        )
    )
    return {
        "name": name,
        "username": username,
        "password": password,
        "role": side,
        "team_id": team.id if team else None,
        "must_change_password": must_change_password,
    }


@router.post("/{drill_id}/participants/test", status_code=201)
async def post_test_players(
    drill_id: int,
    db: AsyncSession = Depends(get_session),
    token: TokenData = Depends(require_role(Role.ADMIN)),
):
    """One Red and one Blue throwaway account for a dry run. They are destroyed after cleanup."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    if drill.status != DrillStatus.SCHEDULED:
        raise HTTPException(status_code=409, detail="Roster is locked after the drill starts.")
    enrolled = int(
        await db.scalar(
            select(func.count(DrillParticipant.id)).where(DrillParticipant.drill_id == drill_id)
        )
        or 0
    )
    if enrolled + 2 > (drill.max_participants or 10):
        raise HTTPException(status_code=409, detail="Two more players do not fit in this roster.")
    tag = secrets.token_hex(2)
    taken: set[str] = set()
    for base in (f"test-red-{tag}", f"test-blue-{tag}"):
        rows = await db.execute(select(User.sub).where(User.sub.like(f"{base}%")))
        taken.update(sub.lower() for sub in rows.scalars())
    created = [
        await _enroll_new(db, drill_id, f"test red {tag}", "red", None, taken, token.sub, False),
        await _enroll_new(db, drill_id, f"test blue {tag}", "blue", None, taken, token.sub, False),
    ]
    await db.commit()
    return {"players": created}


class KeepAccounts(BaseModel):
    keep: bool


@router.put("/{drill_id}/accounts")
async def put_keep_accounts(
    drill_id: int,
    data: KeepAccounts,
    db: AsyncSession = Depends(get_session),
    token: TokenData = Depends(require_role(Role.ADMIN, Role.LEAD)),
):
    """Keep (or destroy, the default) the accounts created for this exercise after its range is cleaned up."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    env = dict(drill.environment_config or {})
    if data.keep:
        env[KEEP_KEY] = True
    else:
        env.pop(KEEP_KEY, None)
    drill.environment_config = env
    await db.commit()
    return {
        "keep_accounts": bool(data.keep),
        "temporary_accounts": len(await exercise_accounts(db, drill_id)),
    }


@router.post("/{drill_id}/accounts/purge")
async def post_purge_accounts(
    drill_id: int,
    db: AsyncSession = Depends(get_session),
    token: TokenData = Depends(require_role(Role.ADMIN)),
):
    """Destroy this exercise's temporary accounts now. Only once the exercise is over and cleaned up."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    env = drill.environment_config or {}
    if (
        drill.status not in {DrillStatus.COMPLETED, DrillStatus.CANCELLED}
        or env.get("cleanup_status") == "stopping"
    ):
        raise HTTPException(
            status_code=409,
            detail="The exercise must be finished before its accounts are destroyed.",
        )
    if env.get("provision_run_id") and env.get("cleanup_status") != "stopped":
        raise HTTPException(status_code=409, detail="Finish VM cleanup first.")
    return {"destroyed": await purge_exercise_accounts(db, drill)}


@router.post("/{drill_id}/participants/bulk", status_code=201)
async def post_participants_bulk(
    drill_id: int,
    data: BulkPlayers,
    db: AsyncSession = Depends(get_session),
    token: TokenData = Depends(require_role(Role.ADMIN)),
):
    """Create accounts from a pasted list of names and enroll them. Passwords are returned once."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    if drill.status != DrillStatus.SCHEDULED:
        raise HTTPException(status_code=409, detail="Roster is locked after the drill starts.")
    names = [n.strip() for n in data.names if n and n.strip()]
    if not names:
        raise HTTPException(status_code=422, detail="Give at least one name.")
    team = None
    if data.team_id is not None:
        team = await db.get(DrillTeam, data.team_id)
        if team is None or team.drill_id != drill_id:
            raise HTTPException(status_code=404, detail="Team not found in this drill.")
    enrolled = int(
        await db.scalar(
            select(func.count(DrillParticipant.id)).where(DrillParticipant.drill_id == drill_id)
        )
        or 0
    )
    limit = drill.max_participants or 10
    if enrolled + len(names) > limit:
        raise HTTPException(
            status_code=409,
            detail=f"{len(names)} players do not fit: {enrolled} of {limit} seats are taken.",
        )
    taken: set[str] = set()
    for base in {re.sub(r"[^a-z0-9]+", ".", n.lower()).strip(".")[:24] or "player" for n in names}:
        rows = await db.execute(select(User.sub).where(User.sub.like(f"{base}%")))
        taken.update(sub.lower() for sub in rows.scalars())
    created = [
        await _enroll_new(db, drill_id, name, data.side, team, taken, token.sub) for name in names
    ]
    await db.flush()
    if team is not None and await team_service.team_captain(db, team) is None:
        await team_service.elect_captain(db, team)
    await db.commit()
    return {"players": created}


@router.delete("/{drill_id}/participants/{user_id}")
async def delete_participant(
    drill_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_session),
    token: TokenData = Depends(require_role(Role.ADMIN, Role.LEAD)),
):
    """Remove a participant from a drill."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    if drill.status != DrillStatus.SCHEDULED:
        raise HTTPException(status_code=409, detail="Roster is locked after the drill starts.")
    participant = (
        await db.execute(
            select(DrillParticipant).where(
                DrillParticipant.drill_id == drill_id,
                DrillParticipant.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    removed = await remove_participant(db, drill_id, user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Participant not found")
    db.add(
        DrillEvent(
            drill_id=drill_id,
            kind="roster",
            title="Participant removed from roster",
            detail=str(user_id),
            side=participant.role if participant else None,
            actor=token.sub,
        )
    )
    await db.commit()
    return {"message": "Participant removed"}


# ============================================================================
# Announcements
# ============================================================================


@router.get("/{drill_id}/announcements")
async def get_announcements(
    drill_id: int,
    db: AsyncSession = Depends(get_session),
):
    """Get all announcements for a drill."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    announcements = await list_drill_announcements(db, drill_id)
    return {
        "announcements": [
            {
                "id": a.id,
                "title": a.title,
                "content": a.content,
                "priority": a.priority,
                "published_by": a.published_by,
                "published_at": a.published_at.isoformat() if a.published_at else None,
            }
            for a in announcements
        ]
    }


@router.post("/{drill_id}/announcements")
async def post_announcement(
    drill_id: int,
    data: AnnouncementCreate,
    db: AsyncSession = Depends(get_session),
):
    """Create a drill announcement."""
    drill = await get_drill(db, drill_id)
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    try:
        announcement = await create_announcement(
            db, drill_id, data.title, data.content, data.priority
        )
        return {"message": "Announcement created", "announcement_id": announcement.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
