# VPN-Only Portal Reachability Check

When to use:
- Portal should be reachable only through OpenVPN, but access fails.
- You need to prove whether failure is bind address, tunnel routing, security group, or service state.

Prompt:

Diagnose why the OpenVPN portal is not reachable in VPN-only mode.
Assume desired behavior: reachable at 10.9.0.1:8088 (TCP clients) or 10.8.0.1:8088 (UDP clients), not publicly exposed.
Return only: ranked hypotheses, read-only validation commands with expected pass/fail output, then lowest-risk fixes with rollback.
Include checks for:
1) openvpn@server-tcp/openvpn@server-udp service health
2) portal process bind host/port
3) tunnel interface addresses and routes
4) Terraform portal ingress settings
5) API health endpoint reachability over tunnel

Expected output:
- Root-cause proof plan
- Safe fix sequence with rollback
