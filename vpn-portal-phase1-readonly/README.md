# VPN Portal Phase 1 (Read-Only)

This folder contains an isolated portal MVP that does not modify OpenVPN service state.

## Guarantees for Phase 1

- Read-only behavior only.
- No changes to existing VPN scripts.
- No restart/reload of OpenVPN.
- No regeneration of any .ovpn profile.

## What it shows

- Active sessions from OpenVPN status file.
- Current snapshot traffic per session and per user.
- Summary cards for active clients, total download, and total upload.
- Live auto-refresh dashboard updates using server-sent events (SSE).
- Built-in daily history for the last 7 days (SQLite-backed snapshots).
- Status Source panel shows configured status files once, with per-source protocol/session details and links to the status viewer.
- Per-session protocol (TCP/UDP) and device hints (phone/pc/unknown).
- History panel is placed at the bottom of the dashboard for cleaner top-level monitoring.

## What it does not do yet

- No disconnect/block user actions.
- No server-side quota enforcement.
- No historical monthly usage unless status snapshots are externally archived.

## Run locally

1. Change directory:

   cd vpn-portal-phase1-readonly

2. Optional env setup:

   cp .env.example .env
   # then export values or source using your preferred shell workflow

3. Start portal:

   chmod +x run_portal.sh
   ./run_portal.sh

4. Open in browser:

   http://127.0.0.1:8088

## API endpoints

- GET /healthz
- GET /api/sessions
- GET /api/summary
- GET /api/live/summary
- GET /api/live/sessions (SSE stream)
- GET /api/history/7d
- GET /status-file

## Configuration

Environment variables:

- PORTAL_HOST default: 127.0.0.1
- PORTAL_PORT default: 8088
- OPENVPN_STATUS_FILE default: auto-detected common paths (legacy single-source fallback)
- OPENVPN_STATUS_FILES default: /var/log/openvpn/status-tcp.log,/var/log/openvpn/status-udp.log (preferred)
- OPENVPN_LOG_FILE default: /var/log/openvpn/openvpn.log
- PORTAL_HISTORY_DB default: /home/ec2-user/apps/vpn-portal-phase1-readonly/data/history.sqlite3
- PORTAL_HISTORY_RETENTION_DAYS default: 7
- PORTAL_HISTORY_SAMPLE_SECONDS default: 60
- PORTAL_TITLE default: OpenVPN Portal Phase 1 (Read-Only)

## Notes for your existing deployment

- If your OpenVPN status paths differ, set OPENVPN_STATUS_FILES before start.
- OPENVPN_STATUS_FILE is still supported, but only for single-file setups.
- If no status file exists, the UI still runs and reports status source missing.
- History is sampled periodically from live snapshots and kept for 7 days by default.

EC2 deployment baseline used by this repo:
- Active VPN services: `openvpn@server-tcp` and `openvpn@server-udp`.
- Legacy `openvpn-server@server` should stay disabled.
- Rebuild `/home/ec2-user/apps/vpn-portal-phase1-readonly/.python-venv` on EC2 after code deploy (do not copy local venv binaries).
- Server configs include status directives:
   - `/etc/openvpn/server-tcp.conf` -> `/var/log/openvpn/status-tcp.log`
   - `/etc/openvpn/server-udp.conf` -> `/var/log/openvpn/status-udp.log`
