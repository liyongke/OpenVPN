---
name: openvpn-vpn-only-portal-reachability
description: >-
  Use when VPN-only portal access fails or is inconsistent across TCP/UDP client
  paths. Trigger on: "portal unreachable", "10.9.0.1:8088", "10.8.0.1:8088",
  "vpn-only", "tunnel route", "bind issue".
---

# OpenVPN VPN-Only Portal Reachability

Check in order:
1. openvpn@server-tcp and openvpn@server-udp health
2. portal bind host/port and process state
3. tunnel interface addresses and routes
4. Terraform ingress posture for VPN-only access
5. health endpoint over tunnel

Rules:
- Return ranked hypotheses, then proof commands with expected pass/fail output.
- Provide low-risk fixes with rollback.

Output:
- Root-cause proof plan
- Safe fix sequence with rollback
- Reachability verification checklist
