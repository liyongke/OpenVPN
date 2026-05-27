# Documentation Hub

This folder is the documentation index. It should route readers to the right source of truth, not duplicate operational procedures.

## Read by Goal

- Quick project orientation: [../README.md](../README.md)
- Day-to-day VPN client usage: [VPN_SH_GUIDE.md](VPN_SH_GUIDE.md)
- Portal runtime/config/deploy behavior: [../openvpn_portal/README.md](../openvpn_portal/README.md)
- Deployment, troubleshooting, and recovery: [OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md)
- Reusable AI prompt workflows: [AI_SKILLS_PROMPT_BANK.md](AI_SKILLS_PROMPT_BANK.md)

## Documentation Roles

- [../README.md](../README.md): front page summary and quick entry points.
- [OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md): deep operational source of truth.
- [VPN_SH_GUIDE.md](VPN_SH_GUIDE.md): client command guide only.
- [../openvpn_portal/README.md](../openvpn_portal/README.md): portal-specific behavior/configuration.
- [PROJECT_STRUCTURE.txt](PROJECT_STRUCTURE.txt): filesystem/layout snapshot.
- [diagrams/README.md](diagrams/README.md): diagram inventory and ownership.

## Diagram Entry Points

- System design workflow: [diagrams/openvpn-design-workflow.svg](diagrams/openvpn-design-workflow.svg)
- System architecture (Style 6 SVG): [diagrams/openvpn-system-architecture-claude.svg](diagrams/openvpn-system-architecture-claude.svg)
- Portal runtime architecture: [diagrams/portal-glass-architecture-style5.svg](diagrams/portal-glass-architecture-style5.svg)
- Portal live data flow: [diagrams/portal-glass-live-dataflow-style5.svg](diagrams/portal-glass-live-dataflow-style5.svg)
- Runtime data flow: [diagrams/openvpn-runtime-dataflow.svg](diagrams/openvpn-runtime-dataflow.svg)
- CI/CD sequence: [diagrams/openvpn-cicd-ssm-sequence.svg](diagrams/openvpn-cicd-ssm-sequence.svg)
- Full catalog: [diagrams/README.md](diagrams/README.md)

## Editing Rules

- Keep this file short and navigational.
- Put procedures and troubleshooting in [OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md).
- Put diagram-specific metadata in [diagrams/README.md](diagrams/README.md).
- When behavior changes, update related docs together: [../README.md](../README.md), [OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md), [AI_SKILLS_PROMPT_BANK.md](AI_SKILLS_PROMPT_BANK.md).
