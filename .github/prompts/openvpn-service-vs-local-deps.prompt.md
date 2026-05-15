# Service Mode vs Local Mode Dependency Management

When to use:
- To prevent pip/venv permission errors in systemd service mode.
- After updating run_portal.sh or deployment scripts.

Prompt:

Verify dependency management logic for portal runs:
1. Service mode (systemd) disables pip install (RUN_PORTAL_MANAGE_DEPS=0).
2. Local/manual runs enable pip install (RUN_PORTAL_MANAGE_DEPS=1 or unset).
3. .env and scripts do not override this logic.
Return: validation commands, expected output, and correction steps if needed.

Expected output:
- Validation checklist
- Correction steps
