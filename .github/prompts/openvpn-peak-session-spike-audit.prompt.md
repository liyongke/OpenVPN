# Peak Session Spike Audit (Raw vs Trusted)

When to use:
- Daily history shows a sudden Peak Active jump that appears inconsistent with normal user/device behavior.
- You need to separate real client growth from transient/noisy status-file entries.

Prompt:

Investigate a portal peak-session anomaly with read-only evidence:
1. Query history DB snapshots for the target UTC day and list rows with highest active_clients.
2. For peak rows, extract session usernames/common names, real endpoints, protocol, bytes, and source status file.
3. Classify sessions into trusted vs suspect using these rules:
   - suspect if identity is UNDEF/unknown or missing
   - suspect if zero traffic + missing virtual IP
4. Compute distribution counts for raw_active, trusted_active, suspect_active on that day.
5. Correlate the peak minute with openvpn@server-tcp/udp journal lines.
6. Return root cause and whether the peak represents real concurrent devices.
Return: evidence table, root cause, and low-risk follow-up actions.

Expected output:
- Snapshot evidence table
- Trusted vs suspect distribution summary
- Journal correlation findings
