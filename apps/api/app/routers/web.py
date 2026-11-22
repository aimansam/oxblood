"""Serves the React UI (built from apps/web) at /app/ and keeps the old entry points working."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse, Response

from app.core.config import settings

router = APIRouter(include_in_schema=False)

# Inside the image the build is copied to /app/web; in a checkout it lives in apps/web/dist.
_HERE = Path(__file__).resolve()
_CANDIDATES = tuple(
    candidate
    for candidate in (
        _HERE.parents[2] / "web",
        _HERE.parents[4] / "apps" / "web" / "dist" if len(_HERE.parents) > 4 else None,
    )
    if candidate is not None
)
_IMMUTABLE = "public, max-age=31536000, immutable"


def web_dir() -> Path:
    if settings.web_dir:
        return Path(settings.web_dir)
    return next((p for p in _CANDIDATES if p.is_dir()), _CANDIDATES[0])


def _is_asset_path(path: str) -> bool:
    """True for file-like URLs that must 404 instead of falling back to the app shell."""
    name = path.rsplit("/", 1)[-1]
    return "." in name or path.startswith("assets/")


def _file_inside(root: Path, path: str) -> Path | None:
    """The file at ``path`` under ``root``, or None. Never leaves ``root``."""
    try:
        target = (root / path).resolve()
        target.relative_to(root.resolve())
    except (ValueError, OSError):
        return None
    return target if target.is_file() else None


@router.api_route("/", methods=["GET", "HEAD"])
def landing() -> RedirectResponse:
    return RedirectResponse("/app/", status_code=302)


@router.api_route("/login", methods=["GET", "HEAD"])
def login() -> RedirectResponse:
    return RedirectResponse("/app/login", status_code=302)


@router.api_route("/drill/", methods=["GET", "HEAD"])
@router.api_route("/drill/{path:path}", methods=["GET", "HEAD"])
def classic_portal(path: str = "") -> RedirectResponse:
    """The classic portal was retired; old bookmarks land on the new UI."""
    return RedirectResponse("/app/", status_code=302)


@router.api_route("/app", methods=["GET", "HEAD"])
def app_without_slash() -> RedirectResponse:
    return RedirectResponse("/app/", status_code=308)


@router.api_route("/app/", methods=["GET", "HEAD"])
@router.api_route("/app/{path:path}", methods=["GET", "HEAD"])
def web_app(path: str = "") -> Response:
    """Serve the UI. Unknown extensionless paths fall back to index.html (client-side routing)."""
    root = web_dir()
    if path:
        found = _file_inside(root, path)
        if found is not None:
            headers = {"Cache-Control": _IMMUTABLE} if path.startswith("assets/") else None
            return FileResponse(found, headers=headers)
        if _is_asset_path(path):
            return PlainTextResponse("Not found", status_code=404)
    index = _file_inside(root, "index.html")
    if index is None:
        return PlainTextResponse("The web app is not built", status_code=503)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
