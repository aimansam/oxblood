"""The range diagrams are drawn from the shipped scenarios; check the data they are drawn from."""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))

from diagram_data import Asset, load_scenarios  # noqa: E402

RANGES = load_scenarios(REPO / "examples" / "scenarios")


def test_every_shipped_scenario_is_loaded():
    files = sorted(p.name for p in (REPO / "examples" / "scenarios").glob("*.scenario.yaml"))
    assert len(RANGES) == len(files) >= 2


def test_output_names_are_unique_and_png():
    names = [r.filename for r in RANGES]
    assert len(set(names)) == len(names)
    assert all(n.startswith("range-") and n.endswith(".png") for n in names)


def test_every_asset_sits_in_a_declared_network():
    for r in RANGES:
        declared = {n.name for n in r.networks}
        assert r.networks and r.assets, r.name
        for a in r.assets:
            assert a.networks and set(a.networks) <= declared, (r.name, a.role)


def test_the_router_joins_every_network_and_is_found():
    for r in RANGES:
        assert r.router is not None, r.name
        assert {n.name for n in r.networks} == set(r.router.networks)


def test_every_non_router_machine_is_drawn_in_exactly_one_network():
    for r in RANGES:
        drawn = [a.role for n in r.networks for a in r.assets_in(n.name)]
        expected = [a.role for a in r.assets if a is not r.router]
        assert sorted(drawn) == sorted(expected), r.name


def test_side_comes_from_the_role_prefix():
    assert Asset("red_attacker", "t", ("n",)).side == "red"
    assert Asset("red", "t", ("n",)).side == "red"
    assert Asset("blue_analyst", "t", ("n",)).side == "blue"
    assert Asset("redirector", "t", ("n",)).side == "neutral"
    assert Asset("file_server", "t", ("n",)).side == "neutral"


def test_machine_counts_are_kept():
    phish = next(r for r in RANGES if r.name == "phish-to-ransom")
    assert next(a for a in phish.assets if a.role == "victim_workstation").count == 3
