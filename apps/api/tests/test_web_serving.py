"""The API serves the React build at /app/ with client-side routing fallback, same origin."""

from __future__ import annotations

import pytest
from app.core.config import get_settings
from fastapi.testclient import TestClient


@pytest.fixture
def web(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<div id=root>spa</div>")
    (tmp_path / "assets" / "app-abc123.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    secret = tmp_path.parent / "outside-secret.txt"
    secret.write_text("do not serve")
    monkeypatch.setenv("OXBLOOD_WEB_DIR", str(tmp_path))
    get_settings.cache_clear()
    from app.main import app

    yield TestClient(app, follow_redirects=False), tmp_path
    get_settings.cache_clear()


def test_index_is_served_without_caching(web):
    client, _ = web
    response = client.get("/app/")
    assert response.status_code == 200
    assert "spa" in response.text
    assert response.headers["Cache-Control"] == "no-cache"


def test_client_routes_fall_back_to_index(web):
    client, _ = web
    for path in ("/app/exercises", "/app/exercises/42", "/app/login"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert "spa" in response.text


def test_fingerprinted_assets_are_cached_forever(web):
    client, _ = web
    response = client.get("/app/assets/app-abc123.js")
    assert response.status_code == 200
    assert "immutable" in response.headers["Cache-Control"]


def test_root_files_are_served(web):
    client, _ = web
    assert client.get("/app/favicon.svg").status_code == 200


def test_missing_assets_404_instead_of_returning_html(web):
    client, _ = web
    assert client.get("/app/assets/missing.js").status_code == 404
    assert client.get("/app/favicon.png").status_code == 404


def test_paths_cannot_leave_the_web_directory(web):
    client, _ = web
    for path in (
        "/app/../outside-secret.txt",
        "/app/%2e%2e/outside-secret.txt",
        "/app/assets/../../outside-secret.txt",
    ):
        response = client.get(path)
        assert "do not serve" not in response.text, path


def test_app_without_trailing_slash_redirects(web):
    client, _ = web
    response = client.get("/app")
    assert response.status_code == 308
    assert response.headers["Location"].endswith("/app/")


def test_unbuilt_app_reports_503(web):
    client, tmp_path = web
    (tmp_path / "index.html").unlink()
    assert client.get("/app/").status_code == 503
    assert client.get("/app/exercises").status_code == 503


def test_old_entry_points_redirect_into_the_app(web):
    client, _ = web
    expected = {
        "/": "/app/",
        "/login": "/app/login",
        "/drill/": "/app/",
        "/drill/anything": "/app/",
    }
    for path, target in expected.items():
        response = client.get(path)
        assert response.status_code == 302, path
        assert response.headers["Location"].endswith(target), (path, response.headers["Location"])


def test_health_probes_answer_at_both_addresses(web):
    client, _ = web
    for path in ("/healthz", "/api/healthz"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.json()["status"] == "ok"


def test_the_web_router_does_not_shadow_the_api(web):
    client, _ = web
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert "spa" not in response.text
    assert client.get("/api/v1/me").status_code in (401, 403)


def test_file_guard_rejects_paths_outside_the_root(tmp_path):
    from app.routers.web import _file_inside

    root = tmp_path / "dist"
    root.mkdir()
    (root / "index.html").write_text("ok")
    (tmp_path / "secret.txt").write_text("do not serve")
    assert _file_inside(root, "index.html") is not None
    assert _file_inside(root, "../secret.txt") is None
    assert _file_inside(root, "assets/../../secret.txt") is None
    assert _file_inside(root, "/etc/passwd") is None
    assert _file_inside(root, "missing.js") is None


def test_head_requests_are_answered(web):
    """Reverse proxies and uptime monitors probe with HEAD."""
    client, _ = web
    for path in ("/app/", "/app/exercises", "/healthz", "/api/healthz"):
        assert client.head(path).status_code == 200, path
    assert client.head("/").status_code == 302
