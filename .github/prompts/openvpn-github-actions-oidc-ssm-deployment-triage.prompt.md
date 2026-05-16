# GitHub Actions OIDC + SSM Deployment Triage

When to use:
- GitHub Actions deploy fails in package/upload/deploy stages.
- OIDC role assumption or SSM command execution fails.
- You need a fast pass/fail path before retrying production deployment.

Prompt:

Analyze this GitHub Actions deployment failure for OpenVPN portal CI/CD.
Return only:
1) Ranked root causes with confidence.
2) Minimal read-only checks and expected pass/fail output for each stage:
   - OIDC role assumption
   - S3 artifact upload/read
   - EC2 instance resolution
   - SSM send-command and command invocation status
   - Post-deploy health checks (portal + OpenVPN status/device-hints guardrails)
3) Lowest-risk correction sequence with rollback per step.
Avoid suggesting static AWS key usage.

Expected output:
- Stage-by-stage failure isolation plan
- Safe correction and rollback sequence
