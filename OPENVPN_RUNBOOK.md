# OpenVPN Deployment Runbook (AWS EC2 + macOS + iPhone)

Complete reference for the OpenVPN deployment in this repository: architecture, server setup, client usage, all encountered issues and their resolutions, and day-to-day operations.

---

## Table of Contents

1. [Scope and Outcome](#1-scope-and-outcome)
2. [Architecture](#2-architecture)
3. [Repository Files](#3-repository-files)
4. [Server Deployment Procedure](#4-server-deployment-procedure)
5. [Client Profile Reference](#5-client-profile-reference)
6. [macOS Setup and Usage — vpn.sh (Recommended)](#6-macos-setup-and-usage--vpnsh-recommended)
7. [macOS Manual Commands (without vpn.sh)](#7-macos-manual-commands-without-vpnsh)
8. [iPhone Setup and Usage](#8-iphone-setup-and-usage)
9. [Issues Encountered and Resolutions](#9-issues-encountered-and-resolutions)
10. [Operational Checks](#10-operational-checks)
11. [Security Notes](#11-security-notes)
12. [Fast Recovery Procedure](#12-fast-recovery-procedure)

---

## 1. Scope and Outcome

**Problem:** WireGuard UDP traffic was being deep-packet-inspected and selectively dropped by the local network, on both port 51820 and port 443. Even valid handshakes produced `0 B received` on the client.

**Solution:** Run OpenVPN dual transport on port 443 with TCP as default and UDP as optional mode.

- Protocol: OpenVPN TCP `443` (default) + UDP `443` (optional)
- Server: EC2 in `ap-southeast-1` (resolve identifiers dynamically via Terraform/AWS CLI)
- Verified result: `curl ifconfig.me` on client returns the value of `terraform output -raw vpn_server_public_ip`

---

## 2. Architecture

```
[ macOS / iPhone ]
        │  TCP 443 (default) / UDP 443 (optional)
        ▼
[ EC2 <vpn_server_public_ip> ]
  tun0: 10.8.0.1 (UDP)
  tun1: 10.9.0.1 (TCP)
  openvpn@server-udp + openvpn@server-tcp
  iptables MASQUERADE (10.8/24, 10.9/24) → eth0 → internet
```

| Property | Value |
|---|---|
| OpenVPN mode | TLS cert mode (`ca/cert/key`) + `tls-crypt` |
| Transport | TCP `443` (default) + UDP `443` (optional) |
| Tunnel (UDP) | `10.8.0.1` (server) ↔ `10.8.0.2` (client) |
| Tunnel (TCP) | `10.9.0.1` (server) ↔ `10.9.0.2` (client) |
| Cipher | `AES-256-CBC` |
| Auth | `SHA256` |
| Key file | `/etc/openvpn/server/static.key` |
| Config file | `/etc/openvpn/server/server.conf` |
| systemd units | `openvpn@server-udp`, `openvpn@server-tcp` |
| DNS (client) | `8.8.8.8`, `1.1.1.1` (forced through tunnel) |
| MTU | `1500`, MSS fix `1400` (prevents TCP-over-TCP fragmentation) |

---

## 3. Repository Files

| File | Purpose |
|---|---|
| `vpn.sh` | macOS helper — connect / disconnect / status / toggle / log |
| `client-openvpn.ovpn` | Client profile; import on macOS or iPhone |
| `openvpn_setup.sh` | Server bootstrap + profile generator; run on EC2 via SSM |
| `setup_openvpn_server.sh` | Earlier draft; kept for reference |
| `main.tf` | Terraform EC2 + security-group definition |

---

## 4. Server Deployment Procedure

### 4.1 Prerequisites

- EC2 reachable via AWS Systems Manager (SSM)
- Security group allows inbound TCP `443` and UDP `443` for VPN traffic
- Outbound internet available on EC2

### 4.2 Run setup script

```bash
# Resolve target values:
INSTANCE_ID="$(aws ec2 describe-instances --filters Name=tag:Name,Values=OpenVPN-Server Name=instance-state-name,Values=running --query 'Reservations[0].Instances[0].InstanceId' --output text)"
VPN_IP="$(terraform output -raw vpn_server_public_ip)"

# Open an SSM shell session, upload/openvpn_setup.sh by your preferred secure method,
# then run it directly on the instance:
aws ssm start-session --target "$INSTANCE_ID"

# In the SSM shell:
#   chmod +x /home/ec2-user/openvpn_setup.sh
#   /home/ec2-user/openvpn_setup.sh "$VPN_IP"

# Retrieve generated profile through your approved secure channel (for example S3 + KMS).
```

What `openvpn_setup.sh` does:
1. Installs OpenVPN via `yum` if not present.
2. Builds a minimal PKI (`ca.crt`, server cert/key, client cert/key) and `ta.key`.
3. Writes `/etc/openvpn/server-udp.conf` and `/etc/openvpn/server-tcp.conf`.
4. Enables and starts `openvpn@server-udp` and `openvpn@server-tcp`.
5. Writes `~/client-openvpn-udp.ovpn`, `~/client-openvpn-tcp.ovpn`, and `~/client-openvpn.ovpn` (TCP default).

### 4.3 Verify server is running

```bash
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":["sudo systemctl is-active openvpn@server-udp","sudo systemctl is-active openvpn@server-tcp","sudo ss -lnup | grep :443","sudo ss -lntp | grep :443"]}'
```

Expected: `active` and a listener on `0.0.0.0:443`.

---

## 5. Client Profile Reference

File: `client-openvpn.ovpn`

```ini
dev tun
proto tcp-client
remote <vpn_server_public_ip> 443
nobind
persist-key
persist-tun
cipher AES-256-GCM
auth SHA256
redirect-gateway def1                     # full tunnel: all traffic via VPN
dhcp-option DNS 8.8.8.8                   # override local DNS
dhcp-option DNS 1.1.1.1
tun-mtu 1500
mssfix 1400                               # prevent TCP-over-TCP fragmentation
verb 3
<ca>...</ca>
<cert>...</cert>
<key>...</key>
<tls-crypt>...</tls-crypt>
```

**Critical:** client and server must use matching cert/key/ta material.

---

## 6. macOS Setup and Usage — vpn.sh (Recommended)

`vpn.sh` wraps all OpenVPN operations into simple subcommands with colour output and auto-verification.

Current helper behavior on macOS:
- Pins DNS to `1.1.1.1` and `8.8.8.8` after successful connect.
- Restores the previous DNS configuration on disconnect.
- Adds temporary bypass host routes for common WeChat/QQ domains via the local default gateway while VPN is up.
- Uses short DNS timeouts for bypass-route lookups, so connect does not block when DNS is flaky.

### 6.1 One-time setup

```bash
# Install OpenVPN (once)
brew install openvpn

# Make script executable (once)
chmod +x vpn.sh

# Optional: add a global alias to ~/.zshrc
echo "alias vpn='$(pwd)/vpn.sh'" >> ~/.zshrc && source ~/.zshrc
```

### 6.2 Daily usage

| Command | What it does |
|---|---|
| `./vpn.sh connect` | Start VPN (TCP default), wait for handshake, print public IP |
| `./vpn.sh connect udp` | Start VPN in UDP mode |
| `./vpn.sh disconnect` | Kill VPN process, show real IP |
| `./vpn.sh toggle` | Connect if off, disconnect if on |
| `./vpn.sh status` | Show connected/disconnected state + current public IP |
| `./vpn.sh log` | Live-tail OpenVPN log (`Ctrl-C` to stop) |

Aliases: `on`/`up` for connect, `off`/`down` for disconnect, `s` for status, `l` for log.

### 6.3 What connect looks like

```
Connecting…
...............
DNS pinned on Wi-Fi: 1.1.1.1 8.8.8.8
Connected!
● VPN connected  (pid 12345)
  Public IP : <vpn_server_public_ip>
  Log       : /tmp/openvpn-client.log
```

### 6.4 What status looks like

```bash
$ ./vpn.sh status
● VPN connected  (pid 12345)
  Public IP : <vpn_server_public_ip>

# After disconnect:
○ VPN disconnected
  Public IP : 175.x.x.x  (your real IP)
```

---

## 7. macOS Manual Commands (without vpn.sh)

```bash
# Connect (daemon mode)
sudo /opt/homebrew/sbin/openvpn \
  --config ./client-openvpn.ovpn \
  --daemon \
  --writepid /tmp/openvpn-client.pid \
  --log /tmp/openvpn-client.log

# Check log
tail -f /tmp/openvpn-client.log
# Look for: "Initialization Sequence Completed"

# Verify traffic is routed through VPN
curl ifconfig.me    # should return <vpn_server_public_ip>

# Disconnect
sudo kill "$(cat /tmp/openvpn-client.pid)"
```

> **Note:** `sudo openvpn` (without full path) fails because `sudo` omits `/opt/homebrew/sbin` from PATH. Always use the full path `/opt/homebrew/sbin/openvpn`.

---

## 8. iPhone Setup and Usage

1. Install **OpenVPN Connect** from the App Store.
2. Transfer `client-openvpn.ovpn` to iPhone via AirDrop, Files app, or email.
3. Tap the file — OpenVPN Connect will prompt to import the profile.
4. Toggle the profile switch to connect.
5. Verify: open a browser and check `ifconfig.me` — it should show `<vpn_server_public_ip>`.

> **Note:** If iPhone still fails after updates, remove old imported profile and re-import the latest `.ovpn` file.

---

## 9. Issues Encountered and Resolutions

### Issue A — Root cause: WireGuard UDP filtered by network DPI

**Symptom:** `wg show` showed bytes sent but `0 B received`. DNS resolving timed out in full-tunnel mode. Port change to UDP 443 had no effect.

**Root cause:** Local ISP/network performing deep-packet inspection, selectively dropping WireGuard handshake packets by protocol signature regardless of port.

**Resolution:** Replaced WireGuard with OpenVPN over TCP 443. TCP 443 is indistinguishable from HTTPS at the network layer.

---

### Issue B — `openvpn-server@server` failed: `Error opening configuration file: server.conf`

**Symptom:** `systemctl start openvpn-server@server` failed immediately.

**Root cause:** The `openvpn-server@` systemd template unit expects config at `/etc/openvpn/server/<name>.conf`, not `/etc/openvpn/<name>.conf`.

**Resolution:**
```bash
sudo mkdir -p /etc/openvpn/server
sudo mv /etc/openvpn/server.conf  /etc/openvpn/server/server.conf
sudo mv /etc/openvpn/static.key   /etc/openvpn/server/static.key
sudo sed -i 's#/etc/openvpn/static.key#/etc/openvpn/server/static.key#' \
  /etc/openvpn/server/server.conf
sudo systemctl restart openvpn-server@server
```

---

### Issue C — `Bad encapsulated packet length` on server after client connects

**Symptom:** Client appeared to connect then was immediately reset.

**Root cause:** Client profile contained the `client` directive (TLS/cert mode). Server was in static-key (`secret`) mode. The two modes are incompatible.

**Resolution:** Remove `client` directive from profile. Use `mode p2p` instead.

---

### Issue D — OpenVPN 2.7 refused to start with static key

**Symptom:** `Options error: Cipher negotiation mode is incompatible with --secret`

**Root cause:** Static-key mode is deprecated in OpenVPN 2.6+ and requires an explicit opt-in flag.

**Resolution:** Add to client profile:
```ini
allow-deprecated-insecure-static-crypto
```

---

### Issue E — macOS `sudo openvpn: command not found`

**Root cause:** `sudo` uses a restricted PATH that excludes `/opt/homebrew/sbin`.

**Resolution:** Always use the full path:
```bash
sudo /opt/homebrew/sbin/openvpn --config ...
```

---

### Issue F — Google, YouTube, X (Twitter), and streaming sites unreachable through VPN

**Symptom:** `curl ifconfig.me` returned the VPN IP, but Google, YouTube, X (Twitter), large downloads, and HTTPS streaming stalled or failed to resolve.

**Root cause (DNS):** `redirect-gateway def1` routes traffic through the tunnel but does not change the DNS resolver. Local router DNS (`192.168.x.x`) was still being used, leaking queries outside the tunnel and potentially filtering results.

**Root cause (MTU):** OpenVPN over TCP wraps packets in another TCP stream (TCP-over-TCP). Without MSS clamping, large packets get fragmented and stall under load.

**Resolution:** Added to client profile:
```ini
dhcp-option DNS 8.8.8.8
dhcp-option DNS 1.1.1.1
tun-mtu 1500
mssfix 1400
```

---

### Issue G — VPN connects but all tunnel traffic times out (TCP/UDP)

**Symptom:** Client shows `Initialization Sequence Completed`, routes are installed, but DNS/HTTPS through tunnel time out.

**Root cause:** Server NAT rule was bound to the wrong outbound interface (hardcoded `eth0` while actual default interface differed).

**Resolution:** Auto-detect outbound interface and apply MASQUERADE on that interface.

```bash
IFACE="$(ip route show default | awk '{print $5; exit}')"
sudo iptables -t nat -C POSTROUTING -s 10.8.0.0/24 -o "$IFACE" -j MASQUERADE || \
  sudo iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o "$IFACE" -j MASQUERADE
```

This logic is now built into `openvpn_setup.sh` and `setup_openvpn_server.sh`.

### Issue H — UDP connects but no internet, while TCP works (or vice versa)

**Symptom:** One transport connects and passes traffic, but the other transport connects with handshake only and cannot pass data.

**Root cause:** Both OpenVPN daemons were configured with the same tunnel subnet (`10.8.0.0/24`) while running simultaneously. This creates conflicting kernel routes across `tun0`/`tun1` and breaks return path for one transport.

**Resolution:** Use distinct tunnel subnets per daemon.

```ini
# UDP daemon
server 10.8.0.0 255.255.255.0

# TCP daemon
server 10.9.0.0 255.255.255.0
```

Also ensure NAT rules exist for both subnets:

```bash
sudo iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o <iface> -j MASQUERADE
sudo iptables -t nat -A POSTROUTING -s 10.9.0.0/24 -o <iface> -j MASQUERADE
```

---

## 10. Operational Checks

### Server

```bash
# Resolve instance and run checks through SSM
INSTANCE_ID="$(aws ec2 describe-instances --filters Name=tag:Name,Values=OpenVPN-Server Name=instance-state-name,Values=running --query 'Reservations[0].Instances[0].InstanceId' --output text)"

aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":["sudo systemctl status openvpn@server-udp --no-pager","sudo systemctl status openvpn@server-tcp --no-pager","sudo journalctl -u openvpn@server-udp -n 50 --no-pager","sudo journalctl -u openvpn@server-tcp -n 50 --no-pager","sudo ss -lntp | grep :443","sudo ip addr show tun0","sudo ip addr show tun1","sudo iptables -t nat -L POSTROUTING -n -v"]}'
```

### Client (macOS)

```bash
# Quick status + public IP
./vpn.sh status

# Live log
./vpn.sh log

# Manual log check
tail -n 50 /tmp/openvpn-client.log

# Verify traffic is routed through VPN
curl ifconfig.me          # expect <vpn_server_public_ip>

# DNS check (should resolve via tunnel DNS, not local router)
nslookup youtube.com      # expect non-192.168.x.x resolver
```

---

## 11. Security Notes

- **Profile files contain private client keys.** Keep them `chmod 600` and never commit to a public repository.
- **Rotate client credentials** if a profile is shared/lost: regenerate client cert/key and redistribute updated profile.
- **Rotate server credentials** if compromise is suspected: regenerate server cert/key and `ta.key`, then redistribute fresh profiles.
- Prefer AWS Systems Manager Session Manager over SSH for administration.
- Keep admin portal ingress restricted to explicit `/32` IP allowlists.

---

## 12. Fast Recovery Procedure

### Client can't connect

```bash
# 1. Check the log for the error
./vpn.sh log
# or
tail -30 /tmp/openvpn-client.log

# 2. Confirm server is alive and listening
curl --max-time 5 -s "http://$(terraform output -raw vpn_server_public_ip):443" || echo "port open (connection refused = good)"

# 3. Re-run setup via SSM if needed
INSTANCE_ID="$(aws ec2 describe-instances --filters Name=tag:Name,Values=OpenVPN-Server Name=instance-state-name,Values=running --query 'Reservations[0].Instances[0].InstanceId' --output text)"
VPN_IP="$(terraform output -raw vpn_server_public_ip)"
aws ssm start-session --target "$INSTANCE_ID"
# Then in session: /home/ec2-user/openvpn_setup.sh "$VPN_IP"

# 4. Reconnect
./vpn.sh connect
```

### Server IP changed (EC2 stop/start)

```bash
# Get new IP
NEW_IP="$(terraform output -raw vpn_server_public_ip)"
echo "New IP: $NEW_IP"

# Update client profile
sed -i '' "s/remote .* 443/remote $NEW_IP 443/" client-openvpn.ovpn

# Reconnect
./vpn.sh connect
```

### Service not running on server

```bash
INSTANCE_ID="$(aws ec2 describe-instances --filters Name=tag:Name,Values=OpenVPN-Server Name=instance-state-name,Values=running --query 'Reservations[0].Instances[0].InstanceId' --output text)"
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":["sudo systemctl restart openvpn@server-udp openvpn@server-tcp","sudo systemctl status openvpn@server-udp --no-pager","sudo systemctl status openvpn@server-tcp --no-pager"]}'
```
