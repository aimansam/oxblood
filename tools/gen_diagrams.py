"""Draw the OxBlood diagrams in assets/diagrams/.

    python3 tools/gen_diagrams.py        # needs matplotlib and PyYAML

Outputs:
    architecture.png          what runs and how the parts talk
    exercise-lifecycle.png    plan, prepare, play, finish
    range-<scenario>.png      one per file in examples/scenarios, drawn from the YAML

The range diagrams read the scenario files, so they change when a scenario does. CI regenerates them and
fails if a scenario has no committed diagram.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Rectangle  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diagram_data import Range, load_scenarios  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "assets" / "diagrams"

# Palette: the app's light theme.
BG = "#ffffff"
PANEL = "#f5f7fa"
BORDER = "#d3d9e3"
TEXT = "#14161f"
MUTED = "#5b6475"
ACCENT = "#f20c35"  # the app's crimson
RED, RED_TINT = "#dc2626", "#fdecec"
BLUE, BLUE_TINT = "#2563eb", "#e8f0fe"
GREEN, GREEN_TINT = "#15803d", "#e7f6ec"
AMBER, AMBER_TINT = "#b45309", "#fdf3e3"


def canvas(width: float, height: float, title: str, subtitle: str = ""):
    fig, ax = plt.subplots(figsize=(width, height), facecolor=BG)
    ax.set_xlim(0, width)
    ax.set_ylim(0, height)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.text(0.3, height - 0.4, title, fontsize=17, fontweight="bold", color=TEXT, va="center")
    ax.add_patch(Rectangle((0.3, height - 0.78), 1.4, 0.06, color=ACCENT, lw=0))
    if subtitle:
        ax.text(0.3, height - 1.05, subtitle, fontsize=10, color=MUTED, va="center")
    return fig, ax


def pill(
    ax, x, y, w, h, text, *, edge=BORDER, face=PANEL, color=TEXT, size=9, bold=False, dashed=False
):
    """A rounded box centred on (x, y)."""
    ax.add_patch(
        FancyBboxPatch(
            (x - w / 2, y - h / 2),
            w,
            h,
            boxstyle="round,pad=0.02,rounding_size=0.12",
            linewidth=1.3,
            edgecolor=edge,
            facecolor=face,
            linestyle="--" if dashed else "-",
        )
    )
    ax.text(
        x,
        y,
        text,
        ha="center",
        va="center",
        fontsize=size,
        color=color,
        fontweight="bold" if bold else "normal",
        linespacing=1.35,
    )


def zone(ax, x0, y0, w, h, label, *, edge=BORDER, sub=""):
    """A labelled region with its title in the top-left corner (x0, y0 is the bottom-left)."""
    ax.add_patch(
        FancyBboxPatch(
            (x0, y0),
            w,
            h,
            boxstyle="round,pad=0.0,rounding_size=0.15",
            linewidth=1.4,
            edgecolor=edge,
            facecolor=BG,
        )
    )
    ax.text(
        x0 + 0.2, y0 + h - 0.28, label, fontsize=10.5, fontweight="bold", color=edge, va="center"
    )
    if sub:
        ax.text(x0 + 0.2, y0 + h - 0.62, sub, fontsize=8.5, color=MUTED, va="center")


def arrow(ax, x1, y1, x2, y2, *, color=MUTED, dashed=False, both=False, label="", at=(0, 0.18)):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle="<|-|>" if both else "-|>",
            mutation_scale=13,
            color=color,
            linewidth=1.4,
            linestyle="--" if dashed else "-",
            shrinkA=0,
            shrinkB=0,
        )
    )
    if label:
        ax.text(
            (x1 + x2) / 2 + at[0],
            (y1 + y2) / 2 + at[1],
            label,
            fontsize=8,
            color=MUTED,
            ha="center",
            va="center",
        )


def save(fig, name: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT_DIR / name, dpi=150, facecolor=BG, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    print(f"✓ {name}")


# ---------------------------------------------------------------------------------------------------------
# architecture
# ---------------------------------------------------------------------------------------------------------


def architecture() -> None:
    fig, ax = canvas(
        14,
        9.2,
        "OxBlood architecture",
        "One API service serves the web UI and the REST API, runs the exercises, and drives Proxmox.",
    )

    pill(ax, 1.55, 5.3, 2.5, 1.5, "Browser\noperators, red and\nblue players", bold=True)
    arrow(ax, 2.8, 5.55, 5.15, 5.55, color=TEXT, label="http :5000", at=(0, 0.2))
    pill(
        ax,
        3.95,
        3.9,
        1.9,
        0.95,
        "Traefik\nHTTPS, production only",
        edge=MUTED,
        color=MUTED,
        size=8,
        dashed=True,
    )
    arrow(ax, 2.2, 4.55, 3.2, 4.15, color=MUTED, dashed=True)
    arrow(ax, 4.9, 3.95, 5.15, 4.2, color=MUTED, dashed=True)

    zone(ax, 5.2, 2.75, 5.5, 4.9, "API container  (FastAPI, one worker)", edge=ACCENT)
    pill(ax, 6.6, 6.35, 2.45, 1.0, "Web UI  /app/\nReact, baked into the image", size=8.5)
    pill(ax, 9.3, 6.35, 2.45, 1.0, "REST API  /api/\nauth · exercises · scoring", size=8.5)
    pill(
        ax,
        7.95,
        4.95,
        5.0,
        1.25,
        "Runner and competition\nprepare · start · stop an exercise\nflags · score ledger · referee",
        edge=ACCENT,
        face=RED_TINT,
        bold=True,
        size=9,
    )
    pill(ax, 6.6, 3.55, 2.45, 1.0, "Scenario catalog\nYAML, read-only,\nsynced on start", size=8)
    pill(ax, 9.3, 3.55, 2.45, 1.0, "In memory\nrate limits · job progress\nevent bus", size=8)

    pill(
        ax,
        12.45,
        6.2,
        2.5,
        1.5,
        "PostgreSQL\nexercises · players\nscore ledger · audit log",
        bold=True,
        size=8.5,
    )
    arrow(ax, 10.7, 6.2, 11.2, 6.2, color=TEXT, both=True)
    pill(
        ax,
        12.45,
        3.9,
        2.5,
        0.9,
        "your own scraper\n(optional)",
        edge=MUTED,
        color=MUTED,
        size=8,
        dashed=True,
    )
    arrow(ax, 10.7, 3.2, 11.2, 3.65, color=MUTED, dashed=True, label="/metrics", at=(0.55, -0.3))

    zone(
        ax,
        3.3,
        0.3,
        10.2,
        1.95,
        "Proxmox VE",
        edge=BLUE,
        sub="the only thing the runner talks to besides the database",
    )
    for x, text in zip(
        (4.35, 6.35, 8.35, 10.35, 12.35),
        (
            "clone, or restore\na clean snapshot",
            "bridges and\nSDN networks",
            "guest agent\nseeds files, flags",
            "console tickets\nfor VM access",
            "drill VMs\n(Linux, Windows,\nOPNsense)",
        ),
        strict=True,
    ):
        pill(ax, x, 0.9, 1.8, 0.8, text, edge=BLUE, face=BLUE_TINT, size=7.8)
    arrow(ax, 7.95, 2.75, 7.95, 2.25, color=BLUE, label="Proxmox API token", at=(1.2, 0))
    save(fig, "architecture.png")


# ---------------------------------------------------------------------------------------------------------
# lifecycle
# ---------------------------------------------------------------------------------------------------------


def lifecycle() -> None:
    fig, ax = canvas(
        16,
        7.6,
        "Life of an exercise",
        "From a scenario file to a scored, cleaned-up exercise. Statuses are the API's (the UI shows active as Live).",
    )
    top, bottom = 6.3, 0.55
    stages = (
        (0.3, 3.2, "1  Plan", "status: scheduled", TEXT),
        (4.05, 4.4, "2  Prepare range", "status: provisioning → validating → ready", ACCENT),
        (9.0, 3.2, "3  Play", "status: active ⇄ paused", GREEN),
        (12.75, 3.0, "4  Finish", "status: completed", BLUE),
    )
    for x0, w, label, sub, edge in stages:
        zone(ax, x0, bottom, w, top - bottom, label, edge=edge, sub=sub)
    mid = (top + bottom) / 2 - 0.4
    for x1, x2 in ((3.5, 4.05), (8.45, 9.0), (12.2, 12.75)):
        arrow(ax, x1, mid, x2, mid, color=TEXT)

    pill(ax, 1.9, 4.85, 2.8, 0.9, "Scenario\nexamples/scenarios/*.yaml", size=8.2)
    pill(
        ax,
        1.9,
        3.3,
        2.8,
        1.6,
        "New exercise wizard\n1 Catalog   2 Details\n3 Format   4 Setup\n5 Snapshots   6 Provision",
        size=8.5,
    )
    pill(
        ax,
        1.9,
        1.5,
        2.8,
        1.05,
        "Snapshots (optional)\nbuild clean ones once,\nrestore them every time",
        size=8,
        edge=AMBER,
        face=AMBER_TINT,
    )
    arrow(ax, 1.9, 4.4, 1.9, 4.1, color=MUTED)
    arrow(ax, 1.9, 2.5, 1.9, 2.03, color=AMBER, dashed=True)

    steps = (
        "Preflight\ntemplates, RAM, storage",
        "Networks\nbridges and SDN",
        "Clone, or restore\nthe clean snapshot",
        "Boot\nwait for the guest agent",
        "Seed\nfiles, flags, static IPs",
        "Validate\nports, services, objectives",
    )
    ys = [5.1 - i * 0.82 for i in range(len(steps))]
    for y, text in zip(ys, steps, strict=True):
        pill(ax, 6.25, y, 3.8, 0.62, text, size=8.3, edge=ACCENT, face=RED_TINT)
    for a, b in zip(ys, ys[1:], strict=False):
        arrow(ax, 6.25, a - 0.31, 6.25, b + 0.31, color=ACCENT)

    play = (
        ("Start", 5.1, 0.55, True),
        ("Active ⇄ Paused", 4.3, 0.55, False),
        (
            "Rounds: red and blue swap\nsides; players submit flags,\nscored in the ledger",
            3.2,
            0.95,
            False,
        ),
        ("Referee: awards, penalties,\nfreeze the scoreboard", 2.15, 0.78, False),
        ("Live map and scoreboard", 1.25, 0.55, False),
    )
    for text, y, h, bold in play:
        pill(ax, 10.6, y, 2.8, h, text, size=8.2, edge=GREEN, face=GREEN_TINT, bold=bold)
    for (_, ya, ha, _), (_, yb, hb, _) in zip(play, play[1:], strict=False):
        arrow(ax, 10.6, ya - ha / 2, 10.6, yb + hb / 2, color=GREEN)

    finish = (
        ("Stop", 5.1, 0.55),
        ("Cleaning\ndestroy clones and bridges", 4.0, 0.78),
        ("Delete exercise accounts\nkeep a final roster", 2.9, 0.78),
        ("Report and debrief", 1.9, 0.55),
    )
    for text, y, h in finish:
        pill(ax, 14.25, y, 2.6, h, text, size=8.2, edge=BLUE, face=BLUE_TINT, bold=text == "Stop")
    for (_, ya, ha), (_, yb, hb) in zip(finish, finish[1:], strict=False):
        arrow(ax, 14.25, ya - ha / 2, 14.25, yb + hb / 2, color=BLUE)
    save(fig, "exercise-lifecycle.png")


# ---------------------------------------------------------------------------------------------------------
# one range per scenario
# ---------------------------------------------------------------------------------------------------------

SIDE_STYLE = {
    "red": (RED, RED_TINT),
    "blue": (BLUE, BLUE_TINT),
    "neutral": (BORDER, PANEL),
}


def range_diagram(r: Range) -> None:
    n = len(r.networks)
    width = max(14.0, 2.75 * n + 1.0)
    stack = max(len(r.assets_in(net.name)) for net in r.networks)
    zone_h = 1.15 + 1.0 * stack
    height = zone_h + 3.7
    subtitle = f"{r.organization} · " if r.organization else ""
    fig, ax = canvas(
        width,
        height,
        r.title,
        subtitle + f"{len(r.networks)} networks, {sum(a.count for a in r.assets)} machines",
    )

    # legend
    lx = width - 7.2
    for i, (label, (edge, face)) in enumerate(
        (
            ("red team machine", SIDE_STYLE["red"]),
            ("blue team machine", SIDE_STYLE["blue"]),
            ("other", SIDE_STYLE["neutral"]),
        )
    ):
        pill(ax, lx + i * 2.4 + 1.0, height - 0.55, 2.0, 0.42, label, edge=edge, face=face, size=8)

    col_w = (width - 0.6) / n
    router = r.router
    router_y = zone_h + 1.6
    if router is not None:
        pill(
            ax,
            width / 2,
            router_y,
            width - 1.2,
            0.85,
            f"{router.role}   ·   {router.template}\nrouter and firewall: joins every network below",
            edge=AMBER,
            face=AMBER_TINT,
            bold=True,
            size=9.5,
        )

    for i, net in enumerate(r.networks):
        x0 = 0.3 + i * col_w + 0.12
        w = col_w - 0.24
        cx = x0 + w / 2
        vlan = f"VLAN {net.vlan_id} · " if net.vlan_id is not None else ""
        zone(ax, x0, 0.4, w, zone_h, net.name, edge=MUTED, sub=f"{vlan}{net.cidr}")
        if router is not None:
            arrow(ax, cx, router_y - 0.43, cx, 0.4 + zone_h, color=AMBER, both=True)
        for j, asset in enumerate(r.assets_in(net.name)):
            edge, face = SIDE_STYLE[asset.side]
            label = asset.role + (f"  ×{asset.count}" if asset.count > 1 else "")
            # A host that bridges networks (a dual-homed web server) names its other legs.
            also = f"\nalso on {', '.join(asset.networks[1:])}" if len(asset.networks) > 1 else ""
            pill(
                ax,
                cx,
                0.4 + zone_h - 1.25 - j * 1.0,
                w - 0.3,
                0.9 if also else 0.78,
                f"{label}\n{asset.template}{also}",
                edge=edge,
                face=face,
                size=7.6,
            )
    save(fig, r.filename)


def main() -> None:
    architecture()
    lifecycle()
    for r in load_scenarios(REPO / "examples" / "scenarios"):
        range_diagram(r)
    print("Done.")


if __name__ == "__main__":
    main()
