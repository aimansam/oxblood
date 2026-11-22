"""scripts/install.sh and scripts/cleanup.sh, run against a stub `docker` so nothing real is touched."""

from __future__ import annotations

import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
INSTALL = REPO / "scripts" / "install.sh"
CLEANUP = REPO / "scripts" / "cleanup.sh"

STUB = """#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
case "$1 $2" in
  "compose version") echo "v2.99.0" ;;
  "volume ls") echo "oxblood-cyber-drill_postgres-data" ;;
esac
exit 0
"""


@pytest.fixture
def sandbox(tmp_path):
    """A PATH with a stub docker, a call log, and a scratch env file location."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    docker = bin_dir / "docker"
    docker.write_text(STUB)
    docker.chmod(docker.stat().st_mode | stat.S_IXUSR)
    log = tmp_path / "docker.log"
    log.write_text("")
    env = {
        **os.environ,
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        "STUB_LOG": str(log),
        "OXBLOOD_ENV_FILE": str(tmp_path / "scratch.env"),
    }
    return env, log, tmp_path / "scratch.env"


def run(script: Path, *args: str, env: dict) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(script), *args],
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=60,
    )


def calls(log: Path) -> list[str]:
    return [line for line in log.read_text().splitlines() if line]


def env_values(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(\S*)", line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


@pytest.mark.parametrize("script", [INSTALL, CLEANUP])
def test_scripts_are_valid_bash_and_executable(script):
    assert subprocess.run(["bash", "-n", str(script)]).returncode == 0
    assert os.access(script, os.X_OK)


@pytest.mark.parametrize("script", [INSTALL, CLEANUP])
def test_help_lists_the_options(script, sandbox):
    env, _, _ = sandbox
    result = run(script, "--help", env=env)
    assert result.returncode == 0
    assert "--dry-run" in result.stdout


# ---------------------------------------------------------------- install


def test_install_creates_an_env_file_with_generated_secrets(sandbox):
    env, log, target = sandbox
    result = run(INSTALL, "--no-start", env=env)
    assert result.returncode == 0, result.stderr
    assert stat.S_IMODE(target.stat().st_mode) == 0o600
    values = env_values(target)
    assert values["POSTGRES_PASSWORD"] != "changeme" and len(values["POSTGRES_PASSWORD"]) == 32
    assert len(values["OXBLOOD_TOKEN_SECRET"]) == 64
    assert values["OXBLOOD_BOOTSTRAP_ADMIN_SUB"] == "admin"
    password = values["OXBLOOD_BOOTSTRAP_ADMIN_PASSWORD"]
    assert len(password) == 24
    assert len({values["POSTGRES_PASSWORD"], values["OXBLOOD_TOKEN_SECRET"], password}) == 3
    assert f"admin / {password}" in result.stdout
    assert calls(log) == [], "--no-start must not run docker"


def test_install_only_changes_the_four_secret_lines(sandbox):
    env, _, target = sandbox
    run(INSTALL, "--no-start", env=env)
    example = (REPO / "deploy" / ".env.example").read_text().splitlines()
    generated = target.read_text().splitlines()
    assert len(generated) == len(example)
    assert sum(1 for a, b in zip(example, generated, strict=True) if a != b) == 4


def test_install_never_touches_an_existing_env_file(sandbox):
    env, _, target = sandbox
    target.write_text("POSTGRES_PASSWORD=mine\n")
    result = run(INSTALL, "--no-start", env=env)
    assert result.returncode == 0
    assert target.read_text() == "POSTGRES_PASSWORD=mine\n"
    assert "Keeping the existing" in result.stdout
    assert "admin /" not in result.stdout


def test_two_installs_get_different_secrets(sandbox, tmp_path):
    env, _, first = sandbox
    run(INSTALL, "--no-start", env=env)
    second = tmp_path / "second.env"
    run(INSTALL, "--no-start", env={**env, "OXBLOOD_ENV_FILE": str(second)})
    a, b = env_values(first), env_values(second)
    assert a["OXBLOOD_TOKEN_SECRET"] != b["OXBLOOD_TOKEN_SECRET"]
    assert a["POSTGRES_PASSWORD"] != b["POSTGRES_PASSWORD"]


def test_install_dry_run_shows_the_start_and_changes_nothing(sandbox):
    env, log, target = sandbox
    result = run(INSTALL, "--dry-run", env=env)
    assert result.returncode == 0
    assert "docker-compose.yml up -d --build --wait" in result.stdout
    assert not target.exists()
    assert calls(log) == []


def test_install_demo_dry_run_uses_the_demo_compose_file(sandbox):
    env, _, target = sandbox
    result = run(INSTALL, "--demo", "--dry-run", env=env)
    assert "docker-compose.demo.yml up -d --build" in result.stdout
    assert not target.exists()


def test_install_rejects_unknown_options(sandbox):
    env, _, _ = sandbox
    result = run(INSTALL, "--nope", env=env)
    assert result.returncode == 2


# ---------------------------------------------------------------- cleanup


def test_cleanup_by_default_keeps_the_data(sandbox):
    env, log, target = sandbox
    target.write_text("SECRET=1\n")
    result = run(CLEANUP, env=env)
    assert result.returncode == 0, result.stderr
    down = [c for c in calls(log) if " down " in f" {c} "]
    assert len(down) == 1 and "docker-compose.yml" in down[0] and "--remove-orphans" in down[0]
    assert "--volumes" not in down[0]
    assert not any(c.startswith("image rm") for c in calls(log))
    assert target.exists()
    assert "Your data is kept" in result.stdout


def test_cleanup_refuses_to_delete_data_without_confirmation(sandbox):
    env, log, _ = sandbox
    result = run(CLEANUP, "--volumes", env=env)
    assert result.returncode != 0
    assert "--yes" in result.stderr
    assert not any(" down " in f" {c} " for c in calls(log)), (
        "nothing may be removed before confirmation"
    )


def test_cleanup_deletes_volumes_when_confirmed(sandbox):
    env, log, _ = sandbox
    result = run(CLEANUP, "--volumes", "--yes", env=env)
    assert result.returncode == 0, result.stderr
    assert any("down" in c and "--volumes" in c for c in calls(log))
    assert "oxblood-cyber-drill_postgres-data" in result.stdout


def test_cleanup_refuses_to_delete_the_env_file_without_confirmation(sandbox):
    env, log, target = sandbox
    target.write_text("SECRET=1\n")
    result = run(CLEANUP, "--env", env=env)
    assert result.returncode != 0
    assert target.exists()
    assert calls(log) == [] or not any(" down " in f" {c} " for c in calls(log))


def test_cleanup_all_removes_everything_it_was_asked_to(sandbox):
    env, log, target = sandbox
    target.write_text("SECRET=1\n")
    result = run(CLEANUP, "--all", "--yes", env=env)
    assert result.returncode == 0, result.stderr
    assert not target.exists()
    assert any(c.startswith("image rm oxblood/api:dev") for c in calls(log))
    assert any("down" in c and "--volumes" in c for c in calls(log))


def test_cleanup_demo_targets_the_demo_project_and_ignores_env(sandbox):
    env, log, target = sandbox
    target.write_text("SECRET=1\n")
    result = run(CLEANUP, "--demo", "--env", "--yes", env=env)
    assert result.returncode == 0, result.stderr
    assert any("docker-compose.demo.yml" in c and " down " in f" {c} " for c in calls(log))
    assert target.exists(), "the demo has no env file; --env must not delete the everyday one"


def test_cleanup_dry_run_changes_nothing(sandbox):
    env, log, target = sandbox
    target.write_text("SECRET=1\n")
    result = run(CLEANUP, "--all", "--dry-run", env=env)
    assert result.returncode == 0
    assert "Dry run: nothing was changed." in result.stdout
    assert target.exists()
    assert calls(log) == []
