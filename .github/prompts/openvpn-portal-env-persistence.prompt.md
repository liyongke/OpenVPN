# Portal .env File Persistence and Recovery

When to use:
- After redeployment, EC2 replacement, or any incident where the portal is missing sessions or fails to start.
- To ensure the portal always has the correct configuration for status file visibility.

Prompt:

Check and enforce persistence of the OpenVPN portal .env file:
1. Confirm /home/ec2-user/apps/vpn-portal-phase1-readonly/.env exists and contains correct settings.
2. If missing, restore from secure backup or recreate with:
   PORTAL_HOST=0.0.0.0
   PORTAL_PORT=8088
   OPENVPN_STATUS_FILES=/var/log/openvpn/status-tcp.log,/var/log/openvpn/status-udp.log
3. Restart the portal service and verify all sessions are visible from all clients.
4. Recommend backup and automation steps for future deployments.
Return: validation commands, expected output, and correction steps.

Expected output:
- Validation checklist
- Correction steps
- Backup/restore automation advice
