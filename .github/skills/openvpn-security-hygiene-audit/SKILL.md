---
name: openvpn-security-hygiene-audit
description: >-
  Use before commit/push or doc publication to detect secrets, insecure TLS
  examples, personal paths, and unsafe workflow patterns. Trigger on: "security
  audit", "before commit", "secret leak", "hardcoded credential", "curl -k".
---

# OpenVPN Security Hygiene Audit

Audit checklist:
1. Hardcoded secrets, tokens, private keys
2. Personal local paths or user-identifying paths
3. TLS bypass patterns without scoped justification
4. Inline credentials on CLI examples
5. Static long-lived AWS credentials in workflows
6. Secret printing in CI logs
7. Unsafe force-push guidance without recovery plan

Rules:
- Provide severity, exact location, and safe replacement.
- If no findings, say so explicitly.

Output:
- Findings by severity
- Safe replacements
- Residual risks
