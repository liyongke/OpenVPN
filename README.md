# OpenVPN Deployment on AWS

Terraform infrastructure and operational scripts for a personal VPN on AWS EC2 (`ap-southeast-1`).
Now configured for **OpenVPN dual transport on port 443**:
- **UDP 443 (primary)** for speed
- **TCP 443 (fallback)** for restrictive networks/DPI filtering

---

## Quick Start

```bash
./vpn.sh connect      # start VPN (UDP default)
./vpn.sh connect tcp  # start VPN over TCP fallback
./vpn.sh on udp       # alias of connect
./vpn.sh disconnect   # stop VPN
./vpn.sh toggle       # flip state (on → off, off → on)
./vpn.sh status       # show state + current public IP
./vpn.sh log          # live-tail the connection log
./vpn.sh speed        # speed test on current route
./vpn.sh speed udp    # temporary UDP test (auto connect/disconnect)
./vpn.sh speed tcp    # temporary TCP test (auto connect/disconnect)
```

`vpn.sh` now also:
- Pins DNS to `1.1.1.1` + `8.8.8.8` while connected.
- Restores your previous macOS DNS settings on disconnect.
- Adds temporary bypass host routes for common WeChat/QQ domains via local gateway while connected.

> **Tip:** add `alias vpn='/Users/ryan/Workspace/OpenVPN_deployment/vpn.sh'` to `~/.zshrc` to use `vpn connect` from anywhere.

### Verify the VPN is working

```bash
curl ifconfig.me        # should return 54.254.169.193 (EC2 IP)
```

---

## Infrastructure

| Resource | Value |
|---|---|
| EC2 Instance | `i-09e463ef599031fe7` |
| Public IP | `54.254.169.193` |
| Region | `ap-southeast-1` (Singapore) |
| Protocol | OpenVPN, UDP 443 primary + TCP 443 fallback |
| Tunnel | `10.8.0.1` (server) ↔ `10.8.0.2` (client) |
| SSH Key | `openvpn-key.pem` |

---

## Repository Files

| File | Purpose |
|---|---|
| `vpn.sh` | **macOS VPN helper** — connect / disconnect / status / toggle / log / speed |
| `client-openvpn-udp.ovpn` | OpenVPN UDP client profile (default) |
| `client-openvpn-tcp.ovpn` | OpenVPN TCP fallback profile |
| `client-openvpn.ovpn` | Legacy profile (still supported by `vpn.sh`) |
| `openvpn_setup.sh` | Server bootstrap + client profile generator |
| `main.tf` | Terraform EC2 + security-group definition |
| `variables.tf` / `outputs.tf` | Terraform vars and outputs |
| `OPENVPN_RUNBOOK.md` | Full OpenVPN implementation + troubleshooting runbook |

---

## Documentation

- **[OPENVPN_RUNBOOK.md](OPENVPN_RUNBOOK.md)** — architecture, server deployment, client setup, all issues and resolutions, security notes.

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
chmod 600 openvpn-key.pem
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

### Notes on Cost

- VPC Flow Logs incur CloudWatch Logs ingestion/storage charges.
- Keep retention low (default is `14` days) to control cost.
- Budget alerts are lightweight and useful for early warning.
