"""conftest for tests/.

The tests under this directory span smoke tests, doc-invariant tests,
and a few live-drill tests that need a real API. The session-scoped
``client`` fixture spins up an in-process FastAPI app via TestClient
so route assertions do not need docker-compose up.
"""

from __future__ import annotations

import pytest
from app.main import app  # noqa: E402
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)
