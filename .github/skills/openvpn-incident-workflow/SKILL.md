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
