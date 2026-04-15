# OpenVPN Incident - Full Workflow

Act as a senior SRE for this repository and run this workflow in order:

1. Rank likely root causes from the provided symptoms and logs.
2. Provide minimal proof tests to confirm/refute each hypothesis (no fixes yet).
3. After proof, provide a lowest-risk fix plan with rollback per step.
4. Provide a post-fix verification matrix across service, auth, API, and data correctness.
5. Extract permanent guardrails and document updates needed.

Constraints:
- Prefer non-destructive checks first.
- Every command must include expected output.
- State uncertainty explicitly.
- Do not skip rollback planning.
