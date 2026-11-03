"""Destroy the accounts that were created for one exercise, once its range is cleaned up.

An invitation link, a pasted list of names or a test-player button creates an account *for* an
exercise and marks it (``users.created_for_drill_id``). When the exercise ends and its VMs are gone,
those accounts have no further use, so they are deleted. Accounts that existed before (picked from the
list) are never touched, and neither is any account enrolled in another live exercise.

Deleting a user cascades to their submissions and per-player scores. The team ledger survives (its
player link is set to null), and a small final roster (who, side, team, points) is saved on the
exercise first so the result is not lost with the logins.
"""

from __future__ import annotations

import logging

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.models_drill import (
    Drill,
    DrillEvent,
    DrillParticipant,
    DrillScoreEvent,
    DrillStatus,
    DrillTeam,
)

log = logging.getLogger("app.services.account_cleanup")

# Set on the exercise (environment_config) to keep its accounts after cleanup.
KEEP_KEY = "keep_accounts"
_LIVE = {DrillStatus.SCHEDULED, DrillStatus.ACTIVE, DrillStatus.PAUSED}


def exercise_accounts_are_kept(drill: Drill) -> bool:
    return bool((drill.environment_config or {}).get(KEEP_KEY))


async def exercise_accounts(db: AsyncSession, drill_id: int) -> list[User]:
    rows = await db.execute(
        select(User).where(User.created_for_drill_id == drill_id, User.role.in_(["red", "blue"]))
    )
    return list(rows.scalars().all())


async def purge_exercise_accounts(db: AsyncSession, drill: Drill) -> int:
    """Delete this exercise's temporary accounts. Returns how many were destroyed."""
    if exercise_accounts_are_kept(drill):
        return 0
    users = await exercise_accounts(db, drill.id)
    if not users:
        return 0
    ids = [u.id for u in users]
    # Never remove an account that another live exercise still uses.
    busy = set(
        (
            await db.execute(
                select(DrillParticipant.user_id)
                .join(Drill, Drill.id == DrillParticipant.drill_id)
                .where(
                    DrillParticipant.user_id.in_(ids),
                    DrillParticipant.drill_id != drill.id,
                    Drill.deleted_at.is_(None),
                    Drill.status.in_(_LIVE),
                )
            )
        )
        .scalars()
        .all()
    )
    doomed = [u for u in users if u.id not in busy]
    if not doomed:
        return 0
    doomed_ids = [u.id for u in doomed]

    team_of = {
        user_id: name
        for user_id, name in (
            await db.execute(
                select(DrillParticipant.user_id, DrillTeam.name)
                .join(DrillTeam, DrillTeam.id == DrillParticipant.drill_team_id)
                .where(
                    DrillParticipant.drill_id == drill.id, DrillParticipant.user_id.in_(doomed_ids)
                )
            )
        ).all()
    }
    points = {
        user_id: int(total or 0)
        for user_id, total in (
            await db.execute(
                select(DrillScoreEvent.user_id, func.sum(DrillScoreEvent.points))
                .where(
                    DrillScoreEvent.drill_id == drill.id, DrillScoreEvent.user_id.in_(doomed_ids)
                )
                .group_by(DrillScoreEvent.user_id)
            )
        ).all()
    }
    env = dict(drill.environment_config or {})
    env["final_roster"] = [
        {
            "username": u.sub,
            "side": u.role,
            "team": team_of.get(u.id),
            "points": points.get(u.id, 0),
        }
        for u in doomed
    ]
    drill.environment_config = env

    # Be explicit about what hangs off the account, so it does not depend on the database cascading.
    await db.execute(
        update(DrillScoreEvent).where(DrillScoreEvent.user_id.in_(doomed_ids)).values(user_id=None)
    )
    await db.execute(
        update(DrillTeam)
        .where(DrillTeam.captain_user_id.in_(doomed_ids))
        .values(captain_user_id=None)
    )
    await db.execute(delete(DrillParticipant).where(DrillParticipant.user_id.in_(doomed_ids)))
    for user in doomed:
        await db.delete(user)
    db.add(
        DrillEvent(
            drill_id=drill.id,
            kind="roster",
            title="Temporary accounts destroyed",
            detail=f"{len(doomed)} account(s) removed after the range was cleaned up",
            actor="system",
        )
    )
    await db.commit()
    log.info("account_cleanup.purged drill=%s accounts=%s", drill.id, len(doomed))
    return len(doomed)
