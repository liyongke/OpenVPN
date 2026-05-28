---
name: openvpn-runtime-ops-guardrails
description: >-
  Use when portal service behavior differs between local and systemd runtime or
  when status ingestion/device hints are inconsistent. Trigger on: "systemd",
  "env drift", "permissions", "status file", "device hints", "portal not updating".
---

# OpenVPN Runtime Ops Guardrails

Validate:
1. systemd unit guardrails (ExecStart, EnvironmentFile, RUN_PORTAL_MANAGE_DEPS)
2. runtime context differences (user/group/path/env)
3. dependency mode correctness (service vs local)
4. OpenVPN status file and device-hints consistency
5. deploy-managed env persistence (.env.tcp/.env.udp)

Rules:
- Read-only diagnostics first.
- Keep one status directive per OpenVPN server config.
- Ensure TCP status path /var/log/openvpn/status-tcp.log and UDP path /var/log/openvpn/status-udp.log.

Output:
- Findings by severity
- Validation evidence
- Fix steps + rollback
- Post-fix verification checklist
