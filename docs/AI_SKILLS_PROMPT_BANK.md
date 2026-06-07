# AI Skills Bank for VPN Ops

Practical, reusable AI skill packs for OpenVPN operations in this repository.

## How to Use

1. Ask naturally for the task outcome (for example: "triage deployment drift" or "analyze AWS bill and optimize cost").
2. Let Copilot auto-select the matching skill based on intent.
3. Provide logs/config/command output as requested.
4. Require pass/fail signals before production changes.

## Skill Storage

- Canonical repository skills: `.github/skills`
- Repository AI behavior rules: `.github/copilot-instructions.md`

## Curated Skill Mapping (.github/skills)

- Skill 1 Incident Workflow: `openvpn-incident-workflow/`
- Skill 2 Deployment Drift Detection: `openvpn-deployment-drift-detection/`
- Skill 3 GitHub OIDC + SSM Deploy Triage: `openvpn-github-oidc-ssm-deploy-triage/`
- Skill 4 Runtime Ops Guardrails: `openvpn-runtime-ops-guardrails/`
- Skill 5 VPN-Only Portal Reachability: `openvpn-vpn-only-portal-reachability/`
- Skill 6 Peak Session Spike Audit: `openvpn-peak-session-spike-audit/`
- Skill 7 Security Hygiene Audit: `openvpn-security-hygiene-audit/`
- Skill 8 AWS Cost Ops: `openvpn-aws-cost-ops/`
- Skill 9 Regression Guardrail Extraction: `openvpn-regression-guardrail-extraction/`

## Recent Hardening Updates

- `openvpn-incident-workflow/` now includes a fast branch for "VPN connected but cannot open Google" with read-only proof steps for NAT/forwarding/MSS and rollback-first fix sequencing.
- `openvpn-regression-guardrail-extraction/` now enforces NAT MASQUERADE presence for `10.8.0.0/24` and `10.9.0.0/24`, NAT persistence checks, and single-`mssfix` validation per server config.

## Why This Set

This bank intentionally removes overlapping micro-templates and keeps only operationally useful skill packs that cover:
- Incident triage to verified fix
- Deployment and runtime drift
- Reachability and status-file correctness
- Security hygiene before commit/push
- AWS cost optimization with confirmation gates
- Regression prevention after incidents

## Skills-Only Policy

- OpenVPN operational workflows are maintained as `.github/skills/*/SKILL.md`.
- Prompt-only templates are not the canonical workflow for this repository.
- New reusable operations guidance should be added as a skill pack, not as a prompt file.
