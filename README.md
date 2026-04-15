# OpenVPN Deployment on AWS

Terraform infrastructure and operational scripts for a personal VPN on AWS EC2 (`ap-southeast-1`).
Now configured for **OpenVPN dual transport on port 443**:
- **TCP 443 (default)** for reliability on restrictive networks
- **UDP 443 (optional)** for speed when the network allows it

---

## Quick Start

```bash
./vpn.sh connect      # start VPN (TCP default)
./vpn.sh connect udp  # optional UDP mode
./vpn.sh on tcp       # alias of connect
./vpn.sh disconnect   # stop VPN
./vpn.sh toggle       # flip state (on → off, off → on)
./vpn.sh status       # show state + current public IP
./vpn.sh log          # live-tail the connection log
./vpn.sh speed        # speed test on current route
./vpn.sh speed udp    # temporary UDP test (auto connect/disconnect)
./vpn.sh speed tcp    # temporary TCP test (auto connect/disconnect)
```

Windows quick start:

```powershell
.\vpn.ps1 connect      # start VPN (TCP default)
.\vpn.ps1 connect udp  # optional UDP mode
.\vpn.ps1 status       # show state + current public IP
.\vpn.ps1 disconnect   # stop VPN
```

```bat
vpn.cmd connect
vpn.cmd status
vpn.cmd disconnect
```

`vpn.sh` now also:
- Pins DNS to `1.1.1.1` + `8.8.8.8` while connected.
- Restores your previous macOS DNS settings on disconnect.
- Adds temporary bypass host routes for common WeChat/QQ domains via local gateway while connected.
- Uses short DNS timeouts for bypass-route lookups so `connect` will not hang if DNS is unstable.

Default protocol note:
- `vpn.sh connect` now defaults to TCP for better reliability on restrictive networks.

> **Tip:** add `alias vpn='/absolute/path/to/OpenVPN_deployment/vpn.sh'` to `~/.zshrc` to use `vpn connect` from anywhere.

### Verify the VPN is working

```bash
curl ifconfig.me        # should return your VPN server public IP
terraform output -raw vpn_server_public_ip
```

---

## Infrastructure

| Resource | Value |
|---|---|
| EC2 Instance | Use `aws ec2 describe-instances` or SSM inventory |
| Public IP | Use `terraform output -raw vpn_server_public_ip` |
| Region | `ap-southeast-1` (Singapore) |
| Protocol | OpenVPN, TCP 443 default + UDP 443 optional |
| Tunnel | UDP `10.8.0.0/24`, TCP `10.9.0.0/24` |
| Admin Access | AWS Systems Manager Session Manager (SSM) |

---

## Repository Files

| File | Purpose |
|---|---|
| `vpn.sh` | Bash VPN helper (macOS + Git Bash on Windows) — connect / disconnect / status / toggle / log / speed |
| `vpn.ps1` | Native Windows PowerShell helper — connect / disconnect / status / toggle / log |
| `vpn.cmd` | CMD wrapper for `vpn.ps1` |
| `client-openvpn-tcp.ovpn` | OpenVPN TCP client profile (default/recommended) |
| `client-openvpn-udp.ovpn` | OpenVPN UDP client profile (optional) |
| `client-openvpn.ovpn` | Mobile-friendly profile (aligned to TCP default) |
| `openvpn_setup.sh` | Server bootstrap + client profile generator |
| `main.tf` | Terraform EC2 + security-group definition |
| `variables.tf` / `outputs.tf` | Terraform vars and outputs |
| `OPENVPN_RUNBOOK.md` | Full OpenVPN implementation + troubleshooting runbook |

---

## Server NAT Note

`openvpn_setup.sh` auto-detects the server's outbound interface for NAT rules instead of hardcoding `eth0`.

This prevents a common EC2 issue where VPN connects successfully but tunnel traffic has no internet egress because the instance uses a different interface name (for example `ens5`).

For dual transport, UDP and TCP server daemons must use different VPN subnets (for example UDP `10.8.0.0/24`, TCP `10.9.0.0/24`) to avoid route conflicts between `tun` devices.

Server config consistency note:
- Keep exactly one `status` directive in each OpenVPN server config.
- `openvpn@server-tcp` must write `/var/log/openvpn/status-tcp.log`.
- `openvpn@server-udp` must write `/var/log/openvpn/status-udp.log`.
- Duplicated or swapped `status` directives will make the portal show valid device data on the wrong protocol row.

## Mobile Notes

- Re-import profile(s) after server/profile updates; mobile apps keep old imported configs.
- Use `client-openvpn.ovpn` or `client-openvpn-tcp.ovpn` as default profile.
- Keep `client-openvpn-udp.ovpn` as an optional fallback profile.

---

## Documentation

- **[OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md)** — architecture, server deployment, client setup, all issues and resolutions, security notes.
- **[AI_SKILLS_PROMPT_BANK.md](AI_SKILLS_PROMPT_BANK.md)** — reusable AI prompts for incident triage, root-cause isolation, safe change execution, and regression guardrails.
- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** — default Copilot behavior for this repository.
- **[.github/prompts](.github/prompts)** — versioned prompt templates for common ops/debug workflows.
- **[.github/workflows/deploy-openvpn-placeholder.yml](.github/workflows/deploy-openvpn-placeholder.yml)** — placeholder CI workflow that runs on push to `main` but does not deploy yet.

AI prompt location note:
- Repo copies live under `.github/prompts` and are shared through git.
- One-click VS Code user prompts remain under `$HOME/Library/Application Support/Code/User/prompts`.
- Keep both in sync when prompt templates are updated.

GitHub Actions deployment note:
- The workflow in `.github/workflows/deploy-openvpn-placeholder.yml` is intentionally non-destructive.
- Later, replace placeholder steps with real deployment commands (artifact upload, SSM rollout, post-checks, rollback).

---

## Admin Portal

- Public URL output: `terraform output portal_admin_url`
- Current design: Nginx on `9443` with IP allowlist + HTTP Basic Auth
- Backend app binds only to `127.0.0.1:8088`
- Live dashboard shows summary/status/sessions first, with 7-day history moved to the bottom
- Status Source panel lists each configured status file once and links each source to the read-only status file viewer
- Active session classification is endpoint-aware, so reused certs/common names can still be distinguished per live connection when peer metadata is available

Security notes:
- Store portal credentials in a password manager.
- Rotate credentials periodically and after any device compromise.
- Keep `portal_admin_cidrs` as tight `/32` values.

Credential rotation (SSM-only):

```bash
chmod +x scripts/rotate_portal_password_ssm.sh
./scripts/rotate_portal_password_ssm.sh
```

This updates Nginx Basic Auth on EC2 and refreshes local `portal_credentials.txt`.

SSM-first operations:

```bash
aws ssm start-session --target <instance-id>
```

Optional non-interactive command execution:

```bash
aws ssm send-command \
  --instance-ids <instance-id> \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":["sudo systemctl status openvpn@server-tcp --no-pager"]}'
```

### Admin Checklist

Run these checks regularly:

TLS/auth safety note:
- For production checks, prefer valid TLS trust (`--cacert <ca.pem>` or trusted cert chain) instead of `-k`.
- Avoid typing raw credentials directly in shell history; load from a secured local file or secret store.

```bash
# 1) Confirm VPN and portal services are up (SSM)
INSTANCE_ID="$(aws ec2 describe-instances --filters Name=tag:Name,Values=OpenVPN-Server Name=instance-state-name,Values=running --query 'Reservations[0].Instances[0].InstanceId' --output text)"
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":["systemctl is-active openvpn@server-tcp","systemctl is-active openvpn@server-udp","systemctl is-active vpn-portal-phase1","systemctl is-active nginx","systemctl is-enabled openvpn-server@server || true","grep -nE \"^status |^status-version \" /etc/openvpn/server-tcp.conf","grep -nE \"^status |^status-version \" /etc/openvpn/server-udp.conf","tail -n 10 /var/log/openvpn/status-tcp.log","tail -n 10 /var/log/openvpn/status-udp.log"]}'

# 2) Confirm portal auth protection
PORTAL_URL="$(terraform output -raw portal_admin_url)"
curl -k -sS -o /dev/null -w 'no-auth:%{http_code}\n' "$PORTAL_URL/healthz"

# 2b) Confirm history and status viewer routes (with auth)
read -r PORTAL_USER PORTAL_PASS < <(awk -F': ' '/^username:/{u=$2} /^password:/{p=$2} END{print u, p}' portal_credentials.txt)
curl -k -sS -u "$PORTAL_USER:$PORTAL_PASS" "$PORTAL_URL/api/history/7d" | head -c 220 && echo
curl -k -sS -u "$PORTAL_USER:$PORTAL_PASS" -o /dev/null -w 'status-file:%{http_code}\n' "$PORTAL_URL/status-file"
curl -k -sS -u "$PORTAL_USER:$PORTAL_PASS" "$PORTAL_URL/api/live/summary" | head -c 420 && echo

# 3) Rotate portal credential when needed
./scripts/rotate_portal_password_ssm.sh
```

Portal runtime note:
- Keep `OPENVPN_STATUS_FILES=/var/log/openvpn/status-tcp.log,/var/log/openvpn/status-udp.log` in `/home/ec2-user/apps/openvpn_portal/.env`.
- `OPENVPN_STATUS_FILE` can remain set for backward compatibility, but multi-source uses `OPENVPN_STATUS_FILES`.
- Do not ship a local `.python-venv` inside deployment artifacts; always recreate the venv on EC2 after deploy.
- Keep the OpenVPN `client-connect` hook enabled in both server configs:
  - `script-security 2`
  - `setenv DEVICE_HINTS_FILE /var/log/openvpn/device_hints.json`
  - `client-connect /etc/openvpn/scripts/client-connect-device-hints.sh`
- Device hints are matched by real endpoint (`ip:port`) first, then by real IP, username, and common name.

---

## Manual Commands (without vpn.sh)

```bash
# Connect
sudo /opt/homebrew/sbin/openvpn \
  --config ./client-openvpn.ovpn \
  --daemon \
  --writepid /tmp/openvpn-client.pid \
  --log /tmp/openvpn-client.log

# Check log
tail -f /tmp/openvpn-client.log

# Disconnect
sudo kill "$(cat /tmp/openvpn-client.pid)"
```

---

## Prerequisites

```bash
brew install openvpn       # install OpenVPN client
chmod +x vpn.sh

# AWS auth for Terraform (no eval needed)
export AWS_PROFILE=default
export AWS_SDK_LOAD_CONFIG=1
```

---

## Cost Tracking and Logs

Terraform now supports:
- **VPC Flow Logs** to CloudWatch Logs (enabled by default)
- **Monthly AWS Budget email alerts** (optional)

### Enable Budget Alerts

Create `terraform.tfvars`:

```hcl
enable_monthly_budget_alert   = true
monthly_budget_limit_usd      = 10
budget_alert_threshold_percent = 80
budget_alert_email            = "you@example.com"
```

Or copy from template:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Then apply:

```bash
terraform init -migrate-state
terraform plan
terraform apply
```

### Verify VPC Flow Logs

```bash
terraform output vpc_flow_log_group_name
terraform output vpc_flow_log_id
```

In AWS Console:
- CloudWatch Logs -> look for `/aws/vpc/flow-logs/<vpc-id>`
- Budgets -> verify `openvpn-monthly-budget` (if enabled)

### Persist Portal Ingress (IaC)

To persist portal exposure rules (port `9443`) in Terraform instead of manual AWS console/CLI changes:

```hcl
enable_portal_ingress = true
portal_ingress_port   = 9443
portal_admin_cidrs    = ["<your-public-ip>/32"]
```

Then apply:

```bash
terraform plan
terraform apply
```

Show resulting URL:

```bash
terraform output portal_admin_url
```

Note:
- Keep `portal_admin_cidrs` as specific `/32` admin IPs; do not use `0.0.0.0/0`.

### Notes on Cost

- VPC Flow Logs incur CloudWatch Logs ingestion/storage charges.
- Keep retention low (default is `14` days) to control cost.
- Budget alerts are lightweight and useful for early warning.
