# Copilot Instructions for OpenVPN Ops Repository

Apply this workflow by default in every new chat for this repository.

## Primary Objective

Operate and debug safely with fast root-cause isolation and low-risk changes.

## Canonical Skill Source

- Use `AI_SKILLS_PROMPT_BANK.md` as the canonical source for reusable AI skill patterns.
- If there is a conflict between ad-hoc prompts and documented skills, follow `AI_SKILLS_PROMPT_BANK.md`.

## Default Incident Workflow

1. Triage symptoms into ranked hypotheses.
2. Prove root cause with minimal, non-destructive checks before changing anything.
3. Propose lowest-risk change sequence with rollback per step.
4. Verify behavior at multiple layers: service, auth, API, data correctness.
5. Extract guardrails and update docs if new lessons are found.

## Safety Rules

- Prefer read-only checks before writes.
- Explicitly state expected pass/fail output for each command.
- Avoid destructive actions unless explicitly requested.
- For production-impacting actions, include rollback steps first.

## OpenVPN/Portal Guardrails

- Keep exactly one `status` directive per OpenVPN server config.
- Ensure TCP writes `/var/log/openvpn/status-tcp.log` and UDP writes `/var/log/openvpn/status-udp.log`.
- Keep `client-connect` device-hints hook enabled when device labels are required.
- Run `bash -n` checks for shell scripts before deployment.

## Documentation Discipline

When behavior changes, update these docs together when relevant:
- `README.md`
- `OPENVPN_RUNBOOK.md`
- `AI_SKILLS_PROMPT_BANK.md`
