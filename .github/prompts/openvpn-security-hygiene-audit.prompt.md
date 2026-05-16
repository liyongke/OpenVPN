# Security Hygiene Audit

When to use:
- Before committing or pushing any docs, scripts, or workflow files.
- After any debugging session that used real credentials inline.
- When reviewing code or docs contributed by others.

Prompt:

Audit this content for security risks before it is committed or published. Check for:
1. Hardcoded credentials, tokens, API keys, or private key material.
2. Personal local paths that expose usernames or machine layout.
3. curl -k or TLS verification bypass without explanation.
4. Inline credentials on command lines visible in process listings or shell history.
5. Static long-lived AWS key references in workflow files.
6. Any echo/print of secret values in CI steps.
7. git force-push without rollback plan.
For each finding: severity (high/medium/low), exact location, and safe replacement.

Expected output:
- Finding list with severity, file, line, and safe fix
- "No findings" if clean
