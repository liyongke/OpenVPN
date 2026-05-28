---
name: openvpn-peak-session-spike-audit
description: >-
  Use when dashboard/history peak active sessions jumps unexpectedly and needs
  trusted-vs-suspect classification with evidence. Trigger on: "peak active",
  "session spike", "anomaly", "history sqlite", "UNDEF user".
---

# OpenVPN Peak Session Spike Audit

Workflow:
1. Query history snapshots for target day/time.
2. Extract peak-row session identities, endpoints, protocol, bytes, and source status file.
3. Classify trusted vs suspect sessions.
4. Compute raw/trusted/suspect distributions.
5. Correlate with OpenVPN service journals.

Rules:
- Read-only evidence gathering.
- Explicitly label confidence and data quality caveats.

Output:
- Evidence table
- Trusted vs suspect summary
- Root-cause conclusion
- Low-risk follow-up actions
