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
