# Documentation Hub

This folder is organized as a layered documentation system so you can start from summary content and drill down into detailed procedures only when needed.

## Documentation Outline

Use this order to navigate summary to detail.

1. High-level summary
- [Repository Front Page](../README.md): scope, architecture, quick start
- [Project Structure](PROJECT_STRUCTURE.txt): canonical layout snapshot
- [System Design + Workflow Diagram (Mermaid)](diagrams/openvpn-design-workflow.mmd): canonical architecture and lifecycle
- [System Design + Workflow Diagram (SVG)](diagrams/openvpn-design-workflow.svg): rendered reference image
- [CI/CD Deployment Sequence Diagram](diagrams/openvpn-cicd-ssm-sequence.mmd): GitHub Actions to EC2 via OIDC and SSM
- [Runtime Data Flow Diagram](diagrams/openvpn-runtime-dataflow.mmd): status/device-hints to portal and history storage
- [Diagram Catalog](diagrams/README.md): all diagram assets and update workflow

2. Task-oriented guides
- [VPN Script Guide](VPN_SH_GUIDE.md): client operations with vpn.sh, vpn.ps1, vpn.cmd
- [Portal Guide](../openvpn_portal/README.md): portal config/runtime/deployment

3. Deep reference and incident operations
- [OpenVPN Runbook](OPENVPN_RUNBOOK.md): end-to-end deployment, verification, troubleshooting, recovery
- [AI Skills Prompt Bank](AI_SKILLS_PROMPT_BANK.md): reusable prompt patterns
- [Prompt Templates](../.github/prompts): versioned templates

## Start Here by Goal

- New to this repo: [../README.md](../README.md)
- Need VPN commands now: [VPN_SH_GUIDE.md](VPN_SH_GUIDE.md)
- Need Terraform/deploy/recovery: [OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md)
- Need portal-specific operations: [../openvpn_portal/README.md](../openvpn_portal/README.md)
- Need AI-assisted operational workflows: [AI_SKILLS_PROMPT_BANK.md](AI_SKILLS_PROMPT_BANK.md)

## Embedded Diagrams

### CI/CD Deployment Sequence

```mermaid
sequenceDiagram
	autonumber
	participant Dev as Developer
	participant GH as GitHub Actions
	participant STS as AWS STS (OIDC)
	participant S3 as S3 Artifact Bucket
	participant SSM as AWS SSM
	participant EC2 as OpenVPN EC2
	participant Portal as vpn-portal-phase1

	Dev->>GH: Push main / workflow_dispatch
	GH->>GH: Validate Python, shell, Terraform
	GH->>GH: Package openvpn_portal artifact
	GH->>GH: Resolve deploy artifact URI
	GH->>GH: Fail fast if ARTIFACT_S3_URI empty
	GH->>STS: Assume role via OIDC
	STS-->>GH: Temporary credentials
	GH->>S3: Upload artifact tar.gz
	GH->>SSM: send-command (deploy script)
	GH->>SSM: Wait for command-executed
	GH->>SSM: On waiter failure, fetch invocation output
	SSM->>EC2: Execute deployment commands
	EC2->>S3: Download artifact
	EC2->>Portal: Restart service (systemd)
	EC2->>EC2: Verify OpenVPN guardrails
	EC2-->>SSM: Command output + status
	SSM-->>GH: Invocation result
	GH->>EC2: Health check via SSM output review
	GH-->>Dev: Pass / Fail with logs
```

### Runtime Data Flow

```mermaid
flowchart LR
	CLIENT[VPN Client\nmacOS / Windows / iPhone]
	TCP[TCP Tunnel\n10.9.0.0/24]
	UDP[UDP Tunnel\n10.8.0.0/24]
	OVPN[OpenVPN Server\nopenvpn@server-tcp/udp]
	STATUS[Status Logs\n/var/log/openvpn/status-tcp.log\n/var/log/openvpn/status-udp.log]
	HINTS[Device Hints\n/var/log/openvpn/device_hints.json]
	PORTAL[Portal API/UI\nopenvpn_portal]
	HISTORY[History DB\nportal_history.db]

	CLIENT --> TCP --> OVPN
	CLIENT --> UDP --> OVPN
	OVPN --> STATUS
	OVPN --> HINTS
	STATUS --> PORTAL
	HINTS --> PORTAL
	PORTAL --> HISTORY
```

## Operational Summary

### Deployment and infra changes

1. Apply Terraform from `infrastructure/`.
2. Backend state is remote (S3) as configured in `infrastructure/backend.hcl`.
3. Use SSM-first workflows for server-side changes.
4. Reconcile portal systemd unit after deploy when needed.

Primary references:
- [OpenVPN Runbook](OPENVPN_RUNBOOK.md)
- [Reconcile Portal Service Script](../scripts/reconcile_portal_service_ssm.sh)

### VPN client operations

1. Use `vpn.sh` on macOS/Git Bash and `vpn.ps1`/`vpn.cmd` on Windows.
2. TCP is default; UDP is optional fallback/performance mode.
3. Client profiles are under `../clients/`.

Primary references:
- [VPN Script Guide](VPN_SH_GUIDE.md)
- [OpenVPN Runbook](OPENVPN_RUNBOOK.md)

### Portal operations

1. Keep VPN-only access as default posture.
2. Keep status file mappings correct (`status-tcp.log`, `status-udp.log`).
3. Keep portal `.env` persisted/backed up across redeployments.
4. Use a single project-level `.python-venv/` in repo layout.

Primary references:
- [Portal Guide](../openvpn_portal/README.md)
- [OpenVPN Runbook](OPENVPN_RUNBOOK.md)

## Security and Guardrails (Summary)

- Keep one `status` directive per OpenVPN server config.
- Keep device-hints `client-connect` hook enabled when device labels are required.
- Run `bash -n` on shell scripts before deployment.
- Never commit secrets/credentials/private keys.

Detailed security guidance:
- [OpenVPN Runbook](OPENVPN_RUNBOOK.md)
- [AI Skills Prompt Bank](AI_SKILLS_PROMPT_BANK.md)
- [Copilot Instructions](../.github/copilot-instructions.md)

