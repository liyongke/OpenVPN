# AI Agent Skills

This folder is reserved for reusable AI agent skill packs used by GitHub Copilot and other coding agents in this repository.

## Purpose

- Store domain-specific skill definitions that improve agent behavior for repeated tasks.
- Keep prompt and workflow knowledge close to the codebase.
- Make agent guidance auditable, reviewable, and versioned.

## What a Skill Should Contain

Each skill folder should include:

- `SKILL.md`: the primary instruction file for the skill.
- Optional templates/examples/assets needed by the skill.
- A short local README if the skill has special setup steps.

## Repository Usage Guidance

- Skills in this folder should target OpenVPN operations, CI/CD troubleshooting, portal runtime checks, or documentation workflows.
- Keep skills focused and task-specific. Avoid very broad, generic instructions.
- Prefer read-only diagnostics first, then safe change sequencing with rollback notes.
- Avoid embedding secrets, credentials, personal paths, or environment-specific hardcoded values.

## Suggested Naming Convention

- Folder names: lowercase kebab-case, for example `openvpn-deploy-triage`.
- One skill per folder.
- Name skills by outcome, not by tool, for example `portal-health-verification` instead of `curl-checks`.

## Review Checklist for New Skills

- Is the purpose clear and narrow?
- Does the skill define expected pass/fail outputs for checks?
- Does it avoid destructive or high-risk defaults?
- Does it match this repository's security and operational guardrails?
- Is it still valid with current docs and workflows?

## Notes for Local-Only Skill Packs

Some skill folders may be local-only and ignored by Git. If a skill should not be committed, keep its ignore rule in `.gitignore` scoped to that specific folder.
