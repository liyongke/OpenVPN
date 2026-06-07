---
name: openvpn-regression-guardrail-extraction
description: >-
  Use after incidents or bug fixes to convert lessons into enforceable pre-checks,
  post-checks, and documentation updates. Trigger on: "prevent regression",
  "extract guardrails", "postmortem actions", "hardening checklist".
---

# OpenVPN Regression Guardrail Extraction

Workflow:
1. Summarize incident root cause and enabling conditions.
2. Define pre-deploy checks that would have prevented it.
3. Define post-deploy smoke tests to catch recurrence.
4. Propose doc and runbook updates.
5. Tag checks as mandatory vs recommended.

Rules:
- Keep guardrails measurable and automatable where possible.
- Avoid vague policies without executable checks.

Output:
- Guardrail checklist
- Smoke tests
- Documentation delta list

## Incident Pattern: VPN Connects But Internet (Google) Fails

Root cause pattern to encode:
- OpenVPN services are active and clients connect, but EC2 lacks NAT MASQUERADE for tunnel CIDRs.
- Typical symptom: client is connected, but external sites fail or time out.

Mandatory pre-checks:
- Verify OpenVPN services are active:
  - `systemctl is-active openvpn@server-udp openvpn@server-tcp`
- Verify forwarding is enabled:
  - `sysctl -n net.ipv4.ip_forward` expected `1`
- Verify NAT rules exist for both subnets on outbound iface:
  - `iptables -t nat -S POSTROUTING`
  - Must include:
    - `-A POSTROUTING -s 10.8.0.0/24 -o <iface> -j MASQUERADE`
    - `-A POSTROUTING -s 10.9.0.0/24 -o <iface> -j MASQUERADE`
- Verify OpenVPN config has exactly one MSS tuning line per server config:
  - `grep -nE '^mssfix ' /etc/openvpn/server-udp.conf /etc/openvpn/server-tcp.conf`
  - Expected: exactly one line in each file.

Mandatory fix guardrails:
- Add NAT rules idempotently using detected default interface.
- Persist NAT via systemd oneshot restore service when host `iptables` unit is not enabled.
- Keep one `mssfix` directive per config (recommended baseline: `mssfix 1360`).

Mandatory post-checks:
- Runtime NAT check:
  - `iptables -t nat -S POSTROUTING`
- Persistence check:
  - `systemctl is-enabled openvpn-nat-restore.service`
  - `systemctl is-active openvpn-nat-restore.service`
- Service health:
  - `systemctl is-active openvpn@server-udp openvpn@server-tcp`
- Egress smoke from server:
  - `curl -sS -o /dev/null -w 'google_http_code=%{http_code}\n' https://www.google.com`
  - Expected HTTP `200`.
- Client smoke through tunnel:
  - Connect with one client profile and verify external HTTPS (for example Google and AWS Console).

Rollback minimum:
- Remove added NAT rules for `10.8.0.0/24` and `10.9.0.0/24`.
- Restore prior OpenVPN config backups if MSS tuning causes regression.
- Disable and stop `openvpn-nat-restore.service` if persistence behavior is incorrect.
