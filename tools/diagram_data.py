"""What the range diagrams draw, read straight from the scenario YAML so they cannot drift from it.

Pure Python (PyYAML only): the drawing code lives in gen_diagrams.py and needs matplotlib.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass(frozen=True)
class Network:
    name: str
    cidr: str
    vlan_id: int | None


@dataclass(frozen=True)
class Asset:
    role: str
    template: str
    networks: tuple[str, ...]
    count: int = 1

    @property
    def side(self) -> str:
        """``red``, ``blue`` or ``neutral``, from the role name's prefix."""
        for side in ("red", "blue"):
            if self.role == side or self.role.startswith(side + "_"):
                return side
        return "neutral"


@dataclass(frozen=True)
class Range:
    name: str
    title: str
    organization: str
    networks: tuple[Network, ...]
    assets: tuple[Asset, ...] = field(default_factory=tuple)

    @property
    def filename(self) -> str:
        return f"range-{self.name}.png"

    @property
    def router(self) -> Asset | None:
        """The machine attached to every network, when there is more than one network."""
        if len(self.networks) < 2:
            return None
        every = {n.name for n in self.networks}
        return next((a for a in self.assets if set(a.networks) == every), None)

    def assets_in(self, network: str) -> list[Asset]:
        """Machines whose only network is ``network`` (the router is drawn separately)."""
        router = self.router
        return [
            a for a in self.assets if a is not router and a.networks and a.networks[0] == network
        ]


def load_range(path: Path) -> Range:
    document = yaml.safe_load(path.read_text())
    meta = document["metadata"]
    spec = document.get("spec") or document
    return Range(
        name=str(meta["name"]),
        title=str(meta.get("title") or meta["name"]),
        organization=str(meta.get("organization") or ""),
        networks=tuple(
            Network(str(n["name"]), str(n.get("cidr") or ""), n.get("vlan_id"))
            for n in spec.get("networks", [])
        ),
        assets=tuple(
            Asset(
                role=str(a["role"]),
                template=str(a.get("template") or ""),
                networks=tuple(str(x) for x in a.get("networks", [])),
                count=int(a.get("count") or 1),
            )
            for a in spec.get("assets", [])
        ),
    )


def load_scenarios(directory: Path) -> list[Range]:
    """Every ``*.scenario.yaml`` in ``directory``, in name order."""
    return sorted(
        (load_range(p) for p in directory.glob("*.scenario.yaml")),
        key=lambda r: r.name,
    )
