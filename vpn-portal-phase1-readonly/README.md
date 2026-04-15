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

## Configuration

Environment variables:

- PORTAL_HOST default: 127.0.0.1
- PORTAL_PORT default: 8088
- OPENVPN_STATUS_FILE default: auto-detected common paths
- OPENVPN_LOG_FILE default: /var/log/openvpn/openvpn.log
- PORTAL_TITLE default: OpenVPN Portal Phase 1 (Read-Only)

## Notes for your existing deployment

- If your OpenVPN status file path differs, set OPENVPN_STATUS_FILE before start.
- If no status file exists, the UI still runs and reports status source missing.
