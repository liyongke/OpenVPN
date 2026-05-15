# OpenVPN Status File and Device Hints Consistency

When to use:
- After OpenVPN config or portal deployment changes.
- To ensure the portal reads the correct status files and device hints are enabled.

Prompt:

Check OpenVPN status file and device hints consistency:
1. Each OpenVPN server config (TCP/UDP) has exactly one status directive, writing to the correct file.
2. Device hints hook is enabled in both configs.
3. Portal .env OPENVPN_STATUS_FILES matches server config outputs.
4. Device hints file path is consistent across configs and .env.
Return: drift table and correction steps.

Expected output:
- Drift/correction table
- Priority fixes
