# Documentation Hub

This folder is the documentation index. It should route readers to the right source of truth, not duplicate operational procedures.

## Read by Goal

- Project overview and quick start: [../README.md](../README.md)
- VPN client day-to-day usage: [VPN_SH_GUIDE.md](VPN_SH_GUIDE.md)
- Portal runtime, API, and deploy behavior: [../openvpn_portal/README.md](../openvpn_portal/README.md)
- Backend data mechanism deep dive: [OPENVPN_PORTAL_BACKEND_DATA_MECHANISM.md](OPENVPN_PORTAL_BACKEND_DATA_MECHANISM.md)
- Deployment, troubleshooting, and recovery: [OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md)
- Reusable AI skill workflows: [AI_SKILLS_PROMPT_BANK.md](AI_SKILLS_PROMPT_BANK.md)

## Documentation Hierarchy

- Level 1 (entrypoint): [../README.md](../README.md)
	- Project scope, architecture summary, CI/CD overview, and links to deeper docs.
- Level 2 (domain guides):
	- [OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md): operational source of truth.
	- [../openvpn_portal/README.md](../openvpn_portal/README.md): backend/frontend portal behavior and APIs.
	- [VPN_SH_GUIDE.md](VPN_SH_GUIDE.md): client command guide only.
	- [AI_SKILLS_PROMPT_BANK.md](AI_SKILLS_PROMPT_BANK.md): AI skill mapping and usage guidance.
- Level 3 (references):
	- [PROJECT_STRUCTURE.txt](PROJECT_STRUCTURE.txt): filesystem/layout snapshot.
	- [diagrams/README.md](diagrams/README.md): diagram inventory and ownership.

## Diagram Entry Points

- System design workflow: [diagrams/openvpn-design-workflow.svg](diagrams/openvpn-design-workflow.svg)
- System architecture (Style 6 SVG): [diagrams/openvpn-system-architecture-claude.svg](diagrams/openvpn-system-architecture-claude.svg)
- Portal runtime architecture: [diagrams/portal-glass-architecture-style5.svg](diagrams/portal-glass-architecture-style5.svg)
- Portal live data flow: [diagrams/portal-glass-live-dataflow-style5.svg](diagrams/portal-glass-live-dataflow-style5.svg)
- Portal backend data mechanism: [diagrams/openvpn-portal-backend-data-mechanism.svg](diagrams/openvpn-portal-backend-data-mechanism.svg)
- Runtime data flow: [diagrams/openvpn-runtime-dataflow.svg](diagrams/openvpn-runtime-dataflow.svg)
- CI/CD sequence: [diagrams/openvpn-cicd-ssm-sequence.svg](diagrams/openvpn-cicd-ssm-sequence.svg)
- Full catalog: [diagrams/README.md](diagrams/README.md)

## Editing Rules

- Keep this file short and navigational.
- Put procedures and troubleshooting in [OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md).
- Put diagram-specific metadata in [diagrams/README.md](diagrams/README.md).
- Keep portal endpoint and runtime specifics in [../openvpn_portal/README.md](../openvpn_portal/README.md).
- When behavior changes, update related docs together: [../README.md](../README.md), [OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md), [AI_SKILLS_PROMPT_BANK.md](AI_SKILLS_PROMPT_BANK.md).
