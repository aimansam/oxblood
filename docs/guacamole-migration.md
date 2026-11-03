# Apache Guacamole Migration

## Architecture

- VM 160 (`cyberdrill-access-gateway`) is dedicated to participant remote
  access.
- `guacamole` and `guacd` run on VM 160 independently of the retired SIEM.
- `eth0` is management (`192.168.0.160`).
- `eth1` is the cyber-drill access path (`10.30.220.20`, VLAN 220).
- VM 160 routes `10.30.0.0/16` through the virtual drill router at `10.30.220.1`.
- Proxmox noVNC remains an Admin/Lead recovery console.

## Current state

- Guacamole 1.5.5 is running with PostgreSQL authentication.
- `guacd` is running.
- Default `guacadmin` credentials were rotated.
- The retired SIEM VM 150 is stopped with automatic boot disabled. Its disks
  are retained; participant access has no dependency on it.
- The virtual drill router is VM 170 and has no connection to the main LAN.
- Compose definition: `deploy/guacamole/docker-compose.yml`.

## OxBlood integration (built)

Players open their workstation through Guacamole instead of the Proxmox console, each in **their own
session**. Operators keep the Proxmox noVNC console as the recovery path.

- **No Guacamole accounts.** OxBlood signs a short-lived (1 hour) login for one player that lists exactly the
  connection they may open (Guacamole's *Encrypted JSON Authentication*: HMAC-SHA256, AES-128-CBC, base64).
  There is nothing to create or delete in Guacamole, and no shared password. Verified against a real
  Guacamole 1.5.5: login works, the link lands straight on the machine, a payload signed with another key is
  refused.
- **Own login on the machine.** When a player opens a workstation, OxBlood creates (idempotently, through the
  guest agent) a Linux user named after them with a password derived from a per-exercise secret, and puts it
  in `sudo`. xrdp gives each login its own desktop, so five players on one Kali do not share a screen. The
  accounts vanish with the VM or its snapshot rollback.
- **Only workstations.** A player can open machines running xrdp (the Kali and Blue GUI images), and only
  those they may see; the access list hides the button elsewhere.
- **Audit.** Each launch is a `Console opened` event on the exercise (who, which machine, which side).
  Disconnects are not recorded, and sessions are not recorded.
- **Off by default.** Set `DIVIDE_GUACAMOLE_URL` and `DIVIDE_GUACAMOLE_JSON_SECRET` (32 hex characters, the
  same value as `GUAC_JSON_SECRET` on the gateway, `openssl rand -hex 16`) to turn it on. The compose file in
  `deploy/guacamole/` enables the extension with `EXTENSIONS=auth-json` and `JSON_SECRET_KEY`.

### Not built yet
- **Range copies.** Match copies reuse the same addresses behind different VLANs, so the gateway cannot tell
  them apart. Players in copy 2 and above get "not available yet". Needs a unique access address per copy
  (with the Linux router that makes copies) and a gateway interface per copy.
- **Memory.** Each extra desktop session on a workstation costs roughly 0.5 GiB; size the Kali for the team.
- **Windows and server consoles** for players (RDP/SSH with scenario credentials).

## File Breach role templates

The File Breach scenario uses dedicated service images for its two exposed
paths:

- `tpl-debian-web-gateway-wazuh` (VM 163): Nginx document portal with access logs.
- `tpl-debian-backup-server-wazuh` (VM 164): Nginx backup manifest/archive portal with access logs.
- `tpl-debian-dmz-docker-wazuh` (VM 171): Docker DMZ with a published web
  frontend and private API, PostgreSQL, and Redis networks.

Both templates were boot-smoke-tested through Proxmox before promotion. The
participant workstations remain `tpl-kali-gui-xrdp` and
`tpl-debian-blue-gui-wazuh-xrdp`.
