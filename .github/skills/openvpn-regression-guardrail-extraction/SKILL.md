---
name: openvpn-regression-guardrail-extraction
description: >-
  Use after incidents or bug fixes to convert lessons into enforceable pre-checks,
  post-checks, and documentation updates. Trigger on: "prevent regression",
  "extract guardrails", "postmortem actions", "hardening checklist".
---

# OpenVPN Regression Guardrail Extraction

Workflow:
1. Summarize incident root cause and enabling conditions.
2. Define pre-deploy checks that would have prevented it.
3. Define post-deploy smoke tests to catch recurrence.
4. Propose doc and runbook updates.
5. Tag checks as mandatory vs recommended.

Rules:
- Keep guardrails measurable and automatable where possible.
- Avoid vague policies without executable checks.

Output:
- Guardrail checklist
- Smoke tests
- Documentation delta list
