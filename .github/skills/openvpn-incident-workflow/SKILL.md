---
name: openvpn-incident-workflow
description: >-
  Use for end-to-end OpenVPN incident handling from symptom triage to root-cause
  proof, safe fix sequencing, and post-fix verification. Trigger on: "incident",
  "outage", "service down", "debug", "root cause", "triage", "fix plan".
---

# OpenVPN Incident Workflow

Run this sequence:
1. Rank hypotheses from symptoms.
2. Prove root cause with minimal read-only checks.
3. Propose lowest-risk fix with rollback per step.
4. Verify service, auth, API, and data integrity.
5. Extract permanent guardrails and required doc updates.

Rules:
- Prefer non-destructive checks first.
- Every command must include expected pass/fail output.
- Do not skip rollback planning for production-impacting changes.
- State uncertainty explicitly.

Output:
- Ranked hypotheses
- Root-cause proof evidence
- Change plan + rollback
- Verification matrix
- Guardrail/doc update list

## Fast Branch: "VPN Connected But Cannot Open Google"

Use this branch early when client reports tunnel connected but public internet unreachable.

Ranked hypotheses for this symptom:
1. Missing NAT MASQUERADE for VPN CIDRs on EC2 (most common).
2. `net.ipv4.ip_forward` disabled on EC2.
3. MTU/MSS mismatch causing packet loss/instability.
4. Client-side DNS/proxy drift.

Read-only proof sequence (with pass/fail expectations):
1. `systemctl is-active openvpn@server-udp openvpn@server-tcp`
  - Pass: both `active`.
2. `sysctl -n net.ipv4.ip_forward`
  - Pass: `1`.
3. `iptables -t nat -S POSTROUTING`
  - Pass: contains MASQUERADE for `10.8.0.0/24` and `10.9.0.0/24` on outbound iface.
  - Fail: chain only shows policy or missing either MASQUERADE rule.
4. `curl -I --max-time 12 https://www.google.com`
  - Pass from EC2 proves instance egress is healthy.
5. `grep -nE '^mssfix ' /etc/openvpn/server-udp.conf /etc/openvpn/server-tcp.conf`
  - Pass: exactly one MSS directive per file.

Lowest-risk change order:
1. Add missing NAT rules idempotently.
2. Restart OpenVPN services only if config changed.
3. Normalize MSS to one directive per config.
4. Add boot persistence for NAT rules if host does not restore iptables automatically.

Rollback-first requirement for this branch:
- Capture `iptables-save` and config backups before any write action.
