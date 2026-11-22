"""The database diagrams are drawn from the models; check the hand-made layout still covers the schema."""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))

from erd_data import GROUPS, load_tables  # noqa: E402

TABLES, EDGES = load_tables()


def base(key: str) -> str:
    return key.split("@")[0]


def test_every_table_is_drawn_in_exactly_one_diagram():
    owners: dict[str, list[str]] = {}
    for g in GROUPS:
        for name in g.cells:
            owners.setdefault(name, []).append(g.filename)
    missing = sorted(set(TABLES) - set(owners))
    assert not missing, f"add these new tables to a diagram in tools/erd_data.py: {missing}"
    assert not sorted(set(owners) - set(TABLES)), "a diagram lists a table that no longer exists"
    assert all(len(files) == 1 for files in owners.values()), owners


def test_stubs_are_real_tables_and_not_owned_by_the_same_diagram_twice():
    for g in GROUPS:
        assert all(base(k) in TABLES for k in g.stubs), g.filename
        assert not set(g.cells) & set(g.stubs), g.filename


def test_no_two_boxes_share_a_cell():
    for g in GROUPS:
        cells = list(g.placed().values())
        assert len(set(cells)) == len(cells), f"{g.filename} puts two boxes in one cell"


def test_every_foreign_key_of_a_drawn_table_is_drawn_or_named():
    """A line may only be left out for a table the diagram calls quiet; otherwise its target must be on the page."""
    for g in GROUPS:
        on_page = {base(k) for k in g.placed()}
        for e in EDGES:
            if e.source in g.cells:
                assert e.target in on_page or e.target in g.quiet, (
                    f"{g.filename}: {e.source}.{e.column} points at {e.target}, which is not on the page"
                )


def test_output_names_are_unique_png_files():
    names = [g.filename for g in GROUPS]
    assert len(set(names)) == len(names)
    assert all(n.startswith("erd-") and n.endswith(".png") for n in names)
    assert all((REPO / "assets" / "diagrams" / n).exists() for n in names), (
        "run tools/gen_diagrams.py"
    )


def test_the_loader_sees_the_whole_schema():
    assert len(TABLES) >= 27 and len(EDGES) >= 40
    assert all(t.primary_key for t in TABLES.values())
