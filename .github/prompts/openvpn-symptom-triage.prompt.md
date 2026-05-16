# Symptom-to-Hypothesis Triage

When to use:
- You have many symptoms and unclear direction.

Prompt:

Act as an SRE investigator. Given these symptoms and logs, rank the top 5 likely root causes with confidence percentages. For each cause, provide the fastest validation command and expected pass/fail output.

Expected output:
- Ranked causes
- Confidence per cause
- One decisive validation per cause
