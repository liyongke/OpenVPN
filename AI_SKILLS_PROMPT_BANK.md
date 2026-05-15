# AI Skills Prompt Bank for VPN Ops

Reusable AI skills and prompt templates for faster operations and debugging in this repository.

## How to Use

1. Pick one skill based on current problem stage.
2. Paste the template prompt into the AI chat.
3. Attach current logs, config snippets, and command outputs.
4. Require explicit expected pass/fail signals before changing production.

## Prompt Storage

- Canonical repo prompt templates: `.github/prompts`
- Repo default AI behavior rules: `.github/copilot-instructions.md`
- Local one-click VS Code prompts: `$HOME/Library/Application Support/Code/User/prompts`

Sync rule:
- Keep repo prompt templates and local user prompts aligned after any template update.

---

## Skill 1: Symptom-to-Hypothesis Triage

When to use:
- You have many symptoms and unclear direction.

Prompt template:

```text
Act as an SRE investigator. Given these symptoms and logs, rank the top 5 likely root causes with confidence percentages. For each cause, provide the fastest validation command and expected pass/fail output.
```

Expected output:
- Ranked causes
- Confidence per cause
- One decisive validation per cause

---

## Skill 2: Root-Cause Isolation Before Fix

When to use:
- Team is jumping to fixes too early.

Prompt template:

```text
Do not suggest fixes yet. Prove root cause first. Build a minimal test plan where each test can eliminate at least one hypothesis. Return only commands and expected outputs.
```

Expected output:
- Minimal proof plan
- Elimination logic per test

---

## Skill 3: Safe Change Sequencing

When to use:
- You have a likely fix and need low-risk execution.

Prompt template:

```text
Create a lowest-risk change plan for production. For each step include: pre-check, exact change, post-check, rollback, and abort conditions.
```

Expected output:
- Ordered low-blast-radius plan
- Explicit rollback points

---

## Skill 4: Cross-Config Consistency Audit

When to use:
- Behavior suggests config drift or conflicting settings.

Prompt template:

```text
Audit consistency across all related configs and runtime services. Output a mismatch table: expected value, actual value, risk, and exact correction.
```

Expected output:
- Drift table
- Corrections with priority

---

## Skill 5: Runtime Context and Permission Diagnosis

When to use:
- Scripts work manually but fail in service context.

Prompt template:

```text
Find runtime-context failures (user/group/path/permissions/env). Provide checks to compare interactive shell vs service runtime and identify exactly where behavior diverges.
```

Expected output:
- Runtime identity and env differences
- Path and permission breakpoints

---

## Skill 6: Observability-First Verification

When to use:
- Need to confirm real behavior after deploy/fix.

Prompt template:

```text
Build a verification matrix for this change: health endpoint, auth gate, API correctness, live stream behavior, and data integrity. Include exact commands and expected outputs.
```

Expected output:
- Layered verification checklist
- Pass/fail criteria for each layer

---

## Skill 7: Deployment Drift Detection

When to use:
- Repo, artifact, and server appear inconsistent.

Prompt template:

```text
Compare source-of-truth across local repo, build artifact, and live host. Identify drift and propose the smallest safe reconciliation plan.
```

Expected output:
- Drift map
- Reconciliation steps

---

## Skill 8: Regression Guardrail Extraction

When to use:
- Incident is resolved and should not repeat.

Prompt template:

```text
From this incident, extract permanent guardrails. Produce pre-deploy checks, post-deploy smoke tests, and doc updates that prevent recurrence.
```

Expected output:
- Guardrail checklist
- Smoke test plan
- Documentation delta

---

## Skill 9: Security Hygiene Audit

When to use:
- Before committing or pushing any docs, scripts, or workflow files.
- After any debugging session that used real credentials inline.
- When reviewing code or docs contributed by others.

Prompt template:

```text
Audit this content for security risks before it is committed or published. Check for:
1. Hardcoded credentials, tokens, API keys, or private key material.
2. Personal local paths that expose usernames or machine layout.
3. curl -k or TLS verification bypass without explanation.
4. Inline credentials on command lines visible in process listings or shell history.
5. Static long-lived AWS key references in workflow files.
6. Any echo/print of secret values in CI steps.
7. git force-push without rollback plan.
For each finding: severity (high/medium/low), exact location, and safe replacement.
```

Expected output:
- Finding list with severity, file, line, and safe fix
- "No findings" if clean

---

## Skill 10: VPN-Only Portal Reachability Check

When to use:
- Portal should be reachable only through OpenVPN, but access fails.
- You need to prove whether failure is bind address, tunnel routing, security group, or service state.

Prompt template:

```text
Diagnose why the OpenVPN portal is not reachable in VPN-only mode.
Assume desired behavior: reachable at 10.9.0.1:8088 (TCP clients) or 10.8.0.1:8088 (UDP clients), not publicly exposed.
Return only: ranked hypotheses, read-only validation commands with expected pass/fail output, then lowest-risk fixes with rollback.
Include checks for:
1) openvpn@server-tcp/openvpn@server-udp service health
2) portal process bind host/port
3) tunnel interface addresses and routes
4) Terraform portal ingress settings
5) API health endpoint reachability over tunnel
```

Expected output:
- Root-cause proof plan
- Safe fix sequence with rollback

---

## Skill 11: Systemd Unit and Service Guardrail Enforcement

When to use:
- After code or deployment changes that might affect systemd unit files or service environment.
- To ensure the portal service always uses the correct ExecStart, environment, and permissions.

Prompt template:

```
Audit and enforce systemd unit guardrails for the OpenVPN portal service. Confirm:
1. ExecStart uses run_portal.sh, not inline uvicorn or hardcoded --host.
2. EnvironmentFile points to the correct .env.
3. RUN_PORTAL_MANAGE_DEPS=0 is set for service mode.
4. Permissions and ownership are root:root, 644.
5. Daemon reload and service restart are performed after changes.
Return: validation commands, expected output, and exact correction steps if drift is found.
```

Expected output:
- Validation checklist
- Correction steps with commands

---

## Skill 12: OpenVPN Status File and Device Hints Consistency

When to use:
- After OpenVPN config or portal deployment changes.
- To ensure the portal reads the correct status files and device hints are enabled.

Prompt template:

```
Check OpenVPN status file and device hints consistency:
1. Each OpenVPN server config (TCP/UDP) has exactly one status directive, writing to the correct file.
2. Device hints hook is enabled in both configs.
3. Portal .env OPENVPN_STATUS_FILES matches server config outputs.
4. Device hints file path is consistent across configs and .env.
Return: drift table and correction steps.
```

Expected output:
- Drift/correction table
- Priority fixes

---

## Skill 13: Service Mode vs Local Mode Dependency Management

When to use:
- To prevent pip/venv permission errors in systemd service mode.
- After updating run_portal.sh or deployment scripts.

Prompt template:

```
Verify dependency management logic for portal runs:
1. Service mode (systemd) disables pip install (RUN_PORTAL_MANAGE_DEPS=0).
2. Local/manual runs enable pip install (RUN_PORTAL_MANAGE_DEPS=1 or unset).
3. .env and scripts do not override this logic.
Return: validation commands, expected output, and correction steps if needed.
```

Expected output:
- Validation checklist
- Correction steps

---

## Combined Incident Prompt

Use this when you want the full workflow in one request.

```text
Act as senior SRE. Execute this workflow in order:
1) Rank likely root causes from symptoms.
2) Provide minimal proof tests (no fixes yet).
3) After proof, provide a lowest-risk fix plan with rollback.
4) Provide post-fix verification matrix across service/network/auth/data.
5) Extract permanent guardrails and doc updates.

Constraints:
- Prefer non-destructive checks first.
- Each command must include expected output.
- State uncertainty explicitly.
- Do not skip rollback planning.
```
