---
name: openvpn-deployment-drift-detection
description: >-
  Use when repo, build artifact, and live host may be out of sync. Trigger on:
  "drift", "inconsistent deploy", "artifact mismatch", "works locally not on EC2".
---

# OpenVPN Deployment Drift Detection

Objective:
- Detect and explain drift across source, artifact, and runtime host.

Workflow:
1. Compare source-of-truth at three layers: repo, artifact, live host.
2. Produce mismatch table with risk and impact.
3. Propose smallest safe reconciliation sequence.
4. Include rollback per reconciliation step.

Rules:
- Read-only comparison before any write.
- Prefer minimal blast-radius reconciliation.

Output:
- Drift map
- Root cause of drift
- Reconciliation plan with rollback
