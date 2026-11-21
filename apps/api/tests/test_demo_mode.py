"""Demo mode: one shared in-memory Proxmox that has every template a scenario asks for."""

from __future__ import annotations

import pytest
from app.core.config import get_settings
from app.runners import runner
from app.runners.mock_adapter import DemoProxmoxAdapter, MockProxmoxAdapter


@pytest.fixture
def demo_mode(monkeypatch):
    monkeypatch.setenv("OXBLOOD_DEMO", "true")
    monkeypatch.setattr(runner, "_demo_adapter", None)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_demo_mode_shares_one_adapter(demo_mode) -> None:
    first = runner._default_adapter()
    assert isinstance(first, DemoProxmoxAdapter)
    assert runner._default_adapter() is first


async def test_demo_adapter_has_every_template(demo_mode) -> None:
    adapter = runner._default_adapter()
    vmid = await adapter.find_template("tpl-anything-a-scenario-names")
    assert vmid is not None
    assert await adapter.find_template("tpl-anything-a-scenario-names") == vmid
    assert (await adapter.get_vm_state(vmid, "pve")).vmid == vmid


async def test_plain_mock_still_has_no_templates() -> None:
    assert await MockProxmoxAdapter().find_template("tpl-anything") is None
