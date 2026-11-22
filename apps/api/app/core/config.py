"""Application settings via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProxmoxSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PROXMOX_", extra="ignore")

    host: str | None = None
    port: int = 8006
    user: str = "oxblood@pve"
    token_id: str | None = None
    token_secret: SecretStr | None = None
    verify_ssl: bool = True
    node: str | None = None  # e.g. "pve" — used when node cannot be auto-detected
    clone_storage: str = "local-lvm"
    seed_snippet_storage: str = "local"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="OXBLOOD_",
        extra="ignore",
    )

    env: Literal["dev", "staging", "production"] = "dev"
    log_level: str = "INFO"
    # Directory holding the built web UI. Empty: /app/web in the image, apps/web/dist in a checkout.
    web_dir: str = ""
    # When set, /metrics requires "Authorization: Bearer <this>". Unset: open (internal network only).
    metrics_token: SecretStr | None = None
    # Demo mode: an in-memory Proxmox that has every template, so the whole app runs without a cluster.
    demo: bool = False
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Database (Drill product).
    db_url: str = "postgresql+asyncpg://oxblood:oxblood@postgres:5432/oxblood"
    db_echo: bool = False

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # CORS
    # Comma-separated list of allowed origins. The browser sends an Origin
    # header on every cross-origin request, and the CORS middleware only
    # echoes it back if it appears verbatim in ``allow_origins``. Wildcards
    # are deliberately not supported in production (CORSMiddleware treats
    # ``allow_origins=["*"]`` as not-safe-with-credentials, which is the
    # default posture we want — set this list explicitly to open up).
    #
    # Default: a localhost origin for the setup wizard's dev loop. In any
    # deployment, override with ``OXBLOOD_CORS_ALLOW_ORIGINS="https://
    # drill.example.com,https://ops.example.com"``.
    #
    # Implementation note: the model field is ``cors_allow_origins_raw`` so
    # pydantic-settings doesn't auto-generate ``OXBLOOD_CORS_ALLOW_ORIGINS``
    # (which would be ambiguous — it would expect a list, not a string). The
    # ``validation_alias`` below pins the friendly env name to this field.
    cors_allow_origins_raw: str = Field(
        default="http://localhost:3000",
        validation_alias="OXBLOOD_CORS_ALLOW_ORIGINS",
    )

    @property
    def cors_allow_origins(self) -> list[str]:
        """Parse the comma-separated env var into a list of origins.

        Whitespace around each entry is stripped; empty entries are
        dropped. The result is the list FastAPI's ``CORSMiddleware``
        expects. Returning a fresh list per call (rather than caching on
        the ``Settings`` instance) keeps the property picklable via the
        ``lru_cache`` proxy and lets us re-read env in tests.
        """
        parts = (s.strip() for s in self.cors_allow_origins_raw.split(","))
        return [p for p in parts if p]

    # Proxmox
    proxmox: ProxmoxSettings = Field(default_factory=ProxmoxSettings)

    # Scenario catalog
    scenarios_dir: str = "/workdir/examples/scenarios"
    sync_on_startup: bool = True
    extra_scenarios_dirs: list[str] = Field(default_factory=list)

    # HMAC secret for the X-Oxblood-Token auth. If unset, dev falls
    # back to a derivation of PROXMOX_TOKEN_SECRET (with a warning);
    # prod should always set this explicitly. The fallback is so a
    # freshly cloned repo can run `oxblood issue-token` without an
    # extra env var.
    oxblood_token_secret: SecretStr | None = Field(
        default=None,
        validation_alias="OXBLOOD_TOKEN_SECRET",
    )

    # P12: prefix the portal is mounted at. Used to build absolute
    # magic-link URLs in admin-issued reset links
    # (POST /api/v1/auth/users/{sub}/issue-reset). Default
    # ``/`` (root) since the SPA is served at the origin root;
    # reverse-proxied deployments (subdomain, custom path) override
    # via OXBLOOD_PORTAL_PATH. Trailing slash is required.
    portal_path: str = "/"

    # Drill lifecycle (L2 2.8) — legacy fallback for runs that do not carry
    # a scenario/drill duration. Normal runs use the explicit drill limit or
    # the scenario's declared duration before consulting this setting. The
    # watchdog flips an overdue run to TIMEOUT, tears down its assets, and
    # writes a RUN_TIMEOUT audit. Set to a non-positive value to disable the
    # fallback (e.g. for soak testing).
    drill_timeout_min: int = 30
    # Disable via env when operators want to keep a run alive past the
    # timeout (e.g., a 4-hour red-team exercise). In dev, set to 0 to
    # defeat the watchdog entirely. The toggle is a bool; the timeout
    # only fires if both ``drill_timeout_enabled=True`` AND
    # ``drill_timeout_min > 0``.
    drill_timeout_enabled: bool = True
    range_host_reserve_mb: int = 2048
    # Operator override: report a RAM shortfall in the range preflight as a warning instead of blocking.
    range_skip_memory_check: bool = False

    # Q22: orphan janitor. Periodically runs the cleanup logic
    # on Asset rows that the Q17 teardown loop left in
    # AssetStatus.ORPHANED. Off by default so deployments don't
    # surprise operators with background destroys; enable in
    # environments where stale VMs accumulate faster than humans
    # notice.
    orphan_janitor_enabled: bool = False
    orphan_janitor_interval_min: int = 30
    orphan_janitor_grace_minutes: int = 5

    # PVE sync interval in seconds. Set to 0 to disable.
    # Syncs RUNNING drills with actual PVE state to detect VM deletion.
    pve_sync_interval_sec: int = 30

    # F3-prep credential login. Lifetime of the HMAC token minted by
    # POST /api/v1/auth/login, in seconds. Default 8h covers a working
    # day; override for shorter demos. Clamped to a positive int at the
    # router (zero / negative falls back to default).
    login_token_ttl_s: int = 8 * 3600

    # F3-prep bootstrap admin. On API startup, if BOTH vars are set AND
    # no admin user exists, a row is created with role="admin". Used to
    # seed the very first admin without an SSH session. Both vars are
    # secrets: ``bootstrap_admin_password`` is a SecretStr so it's
    # never echoed in logs. After the first admin exists the env vars
    # are no-ops; remove them from the env file to reduce blast radius.
    bootstrap_admin_sub: str | None = None
    bootstrap_admin_password: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


class _SettingsProxy:
    """Proxy that always delegates to `get_settings()`, so env-var changes
    (e.g. in tests) are picked up without an import-time freeze.

    Usage in code stays the same as a module-level `settings` instance:
        from app.core.config import settings
        host = settings.proxmox.host
    """

    def __getattr__(self, name: str):
        return getattr(get_settings(), name)


settings = _SettingsProxy()
