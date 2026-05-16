# Runtime Context and Permission Diagnosis

When to use:
- Scripts work manually but fail in service context.

Prompt:

Find runtime-context failures (user/group/path/permissions/env). Provide checks to compare interactive shell vs service runtime and identify exactly where behavior diverges.

Expected output:
- Runtime identity and env differences
- Path and permission breakpoints
