# Systemd Unit and Service Guardrail Enforcement

When to use:
- After code or deployment changes that might affect systemd unit files or service environment.
- To ensure the portal service always uses the correct ExecStart, environment, and permissions.

Prompt:

Audit and enforce systemd unit guardrails for the OpenVPN portal service. Confirm:
1. ExecStart uses run_portal.sh, not inline uvicorn or hardcoded --host.
2. EnvironmentFile points to the correct .env.
3. RUN_PORTAL_MANAGE_DEPS=0 is set for service mode.
4. Permissions and ownership are root:root, 644.
5. Daemon reload and service restart are performed after changes.
Return: validation commands, expected output, and exact correction steps if drift is found.

Expected output:
- Validation checklist
- Correction steps with commands
