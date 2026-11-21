"""API for the e2e stack: the real app, with a mock Proxmox that already has every scenario template.

A bare mock has no templates, so no exercise could ever be prepared and the lifecycle (prepare, start,
play, stop) could not be tested in a browser. Run from apps/api with OXBLOOD_DB_URL etc. in the environment.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api"))

import uvicorn  # noqa: E402
from app.runners import runner  # noqa: E402
from app.runners.mock_adapter import MockProxmoxAdapter  # noqa: E402

TEMPLATES = [
    "tpl-kali-gui-xrdp",
    "tpl-opnsense",
    "tpl-debian-dmz-docker-wazuh",
    "tpl-win2022-ad-auto",
    "tpl-debian-file-server-wazuh",
    "tpl-debian-backup-server-wazuh",
    "tpl-debian-blue-gui-wazuh-xrdp",
    "tpl-debian-log-aggregator-wazuh",
]

mock = MockProxmoxAdapter()
for offset, name in enumerate(TEMPLATES):
    mock.seed_template(name, 9000 + offset)
runner._default_adapter = lambda: mock  # one shared mock, so clones and snapshots persist

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8100, log_level="warning")
