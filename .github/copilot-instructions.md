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

## Security Defaults

Apply these rules by default in every task, doc edit, and code change:

- Never hardcode real credentials, IPs, instance IDs, or access keys in docs or code.
- Use placeholder values (`<instance-id>`, `<your-password>`, `$HOME`, etc.) in all examples.
- Do not use personal local paths (`/Users/<name>/...`) in any committed file; use `$HOME` or relative paths.
- Prefer `--cacert <ca.pem>` over `curl -k` in documented examples; note `-k` is only acceptable for local-loopback testing.
- Pass credentials via variables loaded from a secure file, not as inline literal strings on the command line.
- When writing workflow files, prefer GitHub OIDC + IAM role over long-lived static AWS key pairs.
- When adding new secrets to workflows, list them as `${{ secrets.NAME }}` references only — never echo or print them.
- Before recommending `git push --force`, always require a backup branch/tag and state the exact collaborator recovery command.
- After any session that used inline credentials for testing, recommend credential rotation.
- If any of the above rules would be violated by a user request, flag it explicitly before proceeding.

## Documentation Discipline

When behavior changes, update these docs together when relevant:
- `README.md`
- `OPENVPN_RUNBOOK.md`
- `AI_SKILLS_PROMPT_BANK.md`
