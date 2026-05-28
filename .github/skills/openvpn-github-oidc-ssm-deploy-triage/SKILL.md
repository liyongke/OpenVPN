---
name: openvpn-github-oidc-ssm-deploy-triage
description: >-
  Use when GitHub Actions deployment fails in OIDC, artifact, EC2 target
  resolution, or SSM execution stages. Trigger on: "GitHub Actions failed",
  "OIDC", "SSM", "deploy failure", "artifact_s3_uri", "command invocation".
---

# OpenVPN GitHub OIDC + SSM Deploy Triage

Stage checks (in order):
1. OIDC role assumption
2. S3 artifact upload/read and artifact path resolution
3. EC2 instance discovery
4. SSM send-command result
5. get-command-invocation diagnostics
6. Post-deploy checks (portal + OpenVPN guardrails)

Rules:
- Provide expected pass/fail signal for each stage.
- Keep checks read-only until failure root cause is proven.
- Avoid static credential recommendations.

Output:
- Ranked root causes
- Stage-by-stage evidence
- Lowest-risk correction plan with rollback
