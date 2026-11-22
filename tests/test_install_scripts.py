"""scripts/install.sh and scripts/cleanup.sh, run against stub `docker` and `curl` so nothing real is touched.

Both scripts take no arguments, so behaviour is steered through the stub's environment variables only.
"""

from __future__ import annotations

import gzip
import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
INSTALL = REPO / "scripts" / "install.sh"
CLEANUP = REPO / "scripts" / "cleanup.sh"

DOCKER_STUB = """#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
project=""
for a in "$@"; do
  case "$a" in label=*project=*) project="${a##*=}" ;; esac
done
case "$1" in
  compose)
    case "$2" in
      version) [ "${STUB_NO_COMPOSE:-0}" = 1 ] && exit 1; echo "v2.99.0" ;;
      -f) case " $* " in *" up "*) [ "${STUB_UP_FAIL:-0}" = 1 ] && exit 1 ;; esac ;;
    esac ;;
  ps) case " ${STUB_CONTAINERS:-} " in *" $project "*) echo "abc123" ;; esac ;;
  volume) case " ${STUB_VOLUMES:-} " in *" $project "*) echo "${project}_postgres-data" ;; esac ;;
  inspect) echo "${STUB_DB_RUNNING:-true}" ;;
  exec) [ "${STUB_DUMP_FAIL:-0}" = 1 ] && exit 1; echo "-- PostgreSQL database dump" ;;
  image)
    case "$2" in
      inspect) [ "${STUB_IMAGE_MISSING:-0}" = 1 ] && exit 1 ;;
      rm) [ "${STUB_IMAGE_RM_FAIL:-0}" = 1 ] && exit 1 ;;
    esac ;;
esac
exit 0
"""


@pytest.fixture
def sandbox(tmp_path):
    """A PATH with stub docker and curl, a call log, a scratch env file and a scratch backup directory."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("docker", DOCKER_STUB), ("curl", "#!/usr/bin/env bash\nexit 0\n")):
        exe = bin_dir / name
        exe.write_text(body)
        exe.chmod(exe.stat().st_mode | stat.S_IXUSR)
    log = tmp_path / "docker.log"
    log.write_text("")
    env_file = tmp_path / "scratch.env"
    backups = tmp_path / "backups"
    env = {
        **os.environ,
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        "STUB_LOG": str(log),
        "OXBLOOD_ENV_FILE": str(env_file),
        "OXBLOOD_BACKUP_DIR": str(backups),
    }
    return env, log, env_file, backups


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


def downs(log: Path) -> list[str]:
    return [c for c in calls(log) if " down " in f" {c} "]


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
@pytest.mark.parametrize("arg", ["--help", "--yes", "--demo", "anything"])
def test_no_argument_is_accepted(script, arg, sandbox):
    env, log, env_file, _ = sandbox
    result = run(script, arg, env=env)
    assert result.returncode == 2
    assert "takes no arguments" in result.stderr
    assert calls(log) == [] and not env_file.exists()


# ---------------------------------------------------------------- install


def test_install_creates_an_env_file_with_generated_secrets_and_starts(sandbox):
    env, log, env_file, _ = sandbox
    result = run(INSTALL, env=env)
    assert result.returncode == 0, result.stderr
    assert stat.S_IMODE(env_file.stat().st_mode) == 0o600
    values = env_values(env_file)
    assert values["POSTGRES_PASSWORD"] != "changeme" and len(values["POSTGRES_PASSWORD"]) == 32
    assert len(values["OXBLOOD_TOKEN_SECRET"]) == 64
    assert values["OXBLOOD_BOOTSTRAP_ADMIN_SUB"] == "admin"
    password = values["OXBLOOD_BOOTSTRAP_ADMIN_PASSWORD"]
    assert len(password) == 24
    assert len({values["POSTGRES_PASSWORD"], values["OXBLOOD_TOKEN_SECRET"], password}) == 3
    assert f"admin / {password}" in result.stdout
    assert "http://localhost:5000/app/" in result.stdout
    assert any("docker-compose.yml up -d --build --wait" in c for c in calls(log))


def test_install_only_changes_the_four_secret_lines(sandbox):
    env, _, env_file, _ = sandbox
    run(INSTALL, env=env)
    example = (REPO / "deploy" / ".env.example").read_text().splitlines()
    generated = env_file.read_text().splitlines()
    assert len(generated) == len(example)
    assert sum(1 for a, b in zip(example, generated, strict=True) if a != b) == 4


def test_install_never_touches_an_existing_env_file(sandbox):
    env, log, env_file, _ = sandbox
    env_file.write_text("POSTGRES_PASSWORD=mine\n")
    result = run(INSTALL, env=env)
    assert result.returncode == 0
    assert env_file.read_text() == "POSTGRES_PASSWORD=mine\n"
    assert "Keeping the existing" in result.stdout
    assert "admin /" not in result.stdout
    assert any(" up " in f" {c} " for c in calls(log)), "it still starts the stack"


def test_two_installs_get_different_secrets(sandbox, tmp_path):
    env, _, first, _ = sandbox
    run(INSTALL, env=env)
    second = tmp_path / "second.env"
    run(INSTALL, env={**env, "OXBLOOD_ENV_FILE": str(second)})
    a, b = env_values(first), env_values(second)
    assert a["OXBLOOD_TOKEN_SECRET"] != b["OXBLOOD_TOKEN_SECRET"]
    assert a["POSTGRES_PASSWORD"] != b["POSTGRES_PASSWORD"]


def test_install_explains_a_failed_start(sandbox):
    env, _, _, _ = sandbox
    result = run(INSTALL, env={**env, "STUB_UP_FAIL": "1"})
    assert result.returncode == 1
    assert "port 5000" in result.stderr


def test_install_needs_compose_v2(sandbox):
    env, log, env_file, _ = sandbox
    result = run(INSTALL, env={**env, "STUB_NO_COMPOSE": "1"})
    assert result.returncode == 1
    assert "Compose v2" in result.stderr
    assert not env_file.exists()


# ---------------------------------------------------------------- cleanup


FULL = {
    "STUB_CONTAINERS": "oxblood-cyber-drill oxblood-demo",
    "STUB_VOLUMES": "oxblood-cyber-drill",
}


def test_cleanup_with_nothing_installed_does_nothing(sandbox):
    env, log, _, backups = sandbox
    result = run(CLEANUP, env=env)
    assert result.returncode == 0
    assert "Nothing was installed" in result.stdout
    assert downs(log) == [] and not backups.exists()


def test_cleanup_backs_up_then_removes_everything(sandbox):
    env, log, env_file, backups = sandbox
    env_file.write_text("SECRET=1\n")
    result = run(CLEANUP, env={**env, **FULL})
    assert result.returncode == 0, result.stderr

    files = list(backups.glob("oxblood-*.sql.gz"))
    assert len(files) == 1
    assert stat.S_IMODE(files[0].stat().st_mode) == 0o600
    assert "PostgreSQL database dump" in gzip.decompress(files[0].read_bytes()).decode()
    assert str(files[0]) in result.stdout

    seen = calls(log)
    backup_at = next(i for i, c in enumerate(seen) if c.startswith("exec"))
    first_down = next(i for i, c in enumerate(seen) if " down " in f" {c} ")
    assert backup_at < first_down, "the backup must happen before anything is removed"

    removed = downs(log)
    assert any("docker-compose.yml" in c and "--volumes" in c for c in removed)
    assert any("docker-compose.demo.yml" in c and "--volumes" in c for c in removed)
    assert any(c.startswith("image rm oxblood/api:dev") for c in seen)
    assert not env_file.exists()


def test_cleanup_deletes_nothing_when_the_backup_fails(sandbox):
    env, log, env_file, backups = sandbox
    env_file.write_text("SECRET=1\n")
    result = run(CLEANUP, env={**env, **FULL, "STUB_DUMP_FAIL": "1"})
    assert result.returncode == 1
    assert "nothing was deleted" in result.stderr
    assert downs(log) == []
    assert not any(c.startswith("image rm") for c in calls(log))
    assert env_file.exists()
    assert list(backups.glob("*")) == [], "no half-written backup may be left behind"


def test_cleanup_starts_a_stopped_database_to_back_it_up(sandbox):
    env, log, _, backups = sandbox
    result = run(CLEANUP, env={**env, **FULL, "STUB_DB_RUNNING": "false"})
    assert result.returncode == 0, result.stderr
    seen = calls(log)
    start_at = next(i for i, c in enumerate(seen) if "up -d --wait postgres" in c)
    backup_at = next(i for i, c in enumerate(seen) if c.startswith("exec"))
    assert start_at < backup_at
    assert len(list(backups.glob("*.sql.gz"))) == 1


def test_cleanup_of_only_the_demo_needs_no_backup(sandbox):
    env, log, _, backups = sandbox
    result = run(CLEANUP, env={**env, "STUB_CONTAINERS": "oxblood-demo"})
    assert result.returncode == 0
    assert not any(c.startswith("exec") for c in calls(log))
    assert len(downs(log)) == 1 and "docker-compose.demo.yml" in downs(log)[0]
    assert not backups.exists()


def test_cleanup_never_touches_the_production_stack(sandbox):
    env, log, _, _ = sandbox
    run(
        CLEANUP,
        env={
            **env,
            **FULL,
            "STUB_CONTAINERS": "oxblood-cyber-drill oxblood-demo oxblood-cyber-drill-prod",
        },
    )
    assert not any("production" in c for c in calls(log))


def test_cleanup_keeps_an_image_that_is_still_in_use(sandbox):
    env, _, _, _ = sandbox
    result = run(CLEANUP, env={**env, **FULL, "STUB_IMAGE_RM_FAIL": "1"})
    assert result.returncode == 0
    assert "Kept the image" in result.stdout
