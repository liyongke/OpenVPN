# OpenVPN Deployment

Production-oriented OpenVPN deployment on AWS EC2, with dual transport (TCP/UDP on 443), client helpers for macOS/Windows, and a read-only operations portal.

This page is the high-level entrypoint. Full procedures and incident details are in the docs hierarchy linked below.

## What This Repo Provides

- Infrastructure as code for VPN + portal-related AWS resources (`infrastructure/`)
- Operational automation scripts (`scripts/`)
- Client profiles and local client control scripts (`clients/`, `vpn.sh`, `vpn.ps1`, `vpn.cmd`)
- Read-only OpenVPN operations portal (`openvpn_portal/`)
- Structured documentation with summary and deep-dive layers (`docs/`)

## Architecture At a Glance

- OpenVPN server on EC2 (`ap-southeast-1`)
- TCP 443 as default client path (more reliable on restrictive networks)
- UDP 443 as optional performance path
- Tunnel networks:
  - UDP: `10.8.0.0/24`
  - TCP: `10.9.0.0/24`
- Portal exposed through VPN tunnel by default (not public unless explicitly enabled)

## Quick Start

Use the task guides below instead of duplicating low-level command references on the front page.

- VPN client operations (macOS/Windows): [docs/VPN_SH_GUIDE.md](docs/VPN_SH_GUIDE.md)
- Full deployment, validation, and recovery: [docs/OPENVPN_RUNBOOK.md](docs/OPENVPN_RUNBOOK.md)
- Portal runtime/config/deploy notes: [openvpn_portal/README.md](openvpn_portal/README.md)

### Terraform and Remote Backend

Terraform state is configured to use an S3 remote backend in [infrastructure/main.tf](infrastructure/main.tf).

Use this workflow from the repository root:

```bash
terraform -chdir=infrastructure init
terraform -chdir=infrastructure plan
terraform -chdir=infrastructure apply
```

## Documentation Outline

Start with summary pages, then follow links to task guides and deep runbooks.

1. Summary layer
- [Documentation Hub](docs/README.md): top-level map and operational summary
- [Project Structure](docs/PROJECT_STRUCTURE.txt): repository layout reference

2. Task guide layer
- [VPN Script Guide](docs/VPN_SH_GUIDE.md): daily client commands on macOS/Windows
- [Portal Guide](openvpn_portal/README.md): portal config/runtime/deploy notes

3. Deep reference layer
- [OpenVPN Runbook](docs/OPENVPN_RUNBOOK.md): deployment, validation, troubleshooting, recovery
- [AI Skills Prompt Bank](docs/AI_SKILLS_PROMPT_BANK.md): reusable operations/debug prompts
- [Prompt Templates](.github/prompts): versioned prompt templates

## Read by Goal

- I need a quick orientation: [docs/README.md](docs/README.md)
- I need VPN client commands: [docs/VPN_SH_GUIDE.md](docs/VPN_SH_GUIDE.md)
- I need deployment or incident recovery steps: [docs/OPENVPN_RUNBOOK.md](docs/OPENVPN_RUNBOOK.md)
- I need portal-specific operations: [openvpn_portal/README.md](openvpn_portal/README.md)
- I need AI prompt workflows: [docs/AI_SKILLS_PROMPT_BANK.md](docs/AI_SKILLS_PROMPT_BANK.md)

## Repo Layout

- `infrastructure/` Terraform
- `scripts/` Ops scripts
- `clients/` OpenVPN client profiles
- `openvpn_portal/` Portal app
- `docs/` Docs hub + guides + runbook
- `keys/` Key material (private keys are git-ignored)

## Security Baseline

- Do not commit secrets, private keys, or credential files.
- Prefer SSM-based server operations over ad-hoc SSH.
- Keep exactly one local project venv (`.python-venv/`).
- Keep portal `.env` backed up and restore it after redeploy/recovery.

