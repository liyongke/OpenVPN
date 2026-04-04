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

**Solution:** Migrate to OpenVPN over TCP 443. TCP traffic on port 443 is rarely blocked because it is indistinguishable from HTTPS at the transport layer.

- Protocol: OpenVPN TCP `443`
- Server: EC2 `i-09e463ef599031fe7`, `ap-southeast-1`, IP `54.254.169.193`
- Verified result: `curl ifconfig.me` on client returns `54.254.169.193` (all traffic egresses through EC2)

---

## 2. Architecture

```
[ macOS / iPhone ]
        │  TCP 443
        ▼
[ EC2 54.254.169.193 ]
  tun0: 10.8.0.1
  openvpn-server@server (TCP 443)
  iptables MASQUERADE → eth0 → internet
```

| Property | Value |
|---|---|
| OpenVPN mode | Static key (`secret`), point-to-point (`mode p2p`) |
| Transport | TCP `443` |
| Tunnel | `10.8.0.1` (server) ↔ `10.8.0.2` (client) |
| Cipher | `AES-256-CBC` |
| Auth | `SHA256` |
| Key file | `/etc/openvpn/server/static.key` |
| Config file | `/etc/openvpn/server/server.conf` |
| systemd unit | `openvpn-server@server` |
| DNS (client) | `8.8.8.8`, `1.1.1.1` (forced through tunnel) |
| MTU | `1500`, MSS fix `1400` (prevents TCP-over-TCP fragmentation) |

---

## 3. Repository Files

| File | Purpose |
|---|---|
| `vpn.sh` | macOS helper — connect / disconnect / status / toggle / log |
| `client-openvpn.ovpn` | Client profile; import on macOS or iPhone |
| `openvpn_setup.sh` | Server bootstrap + profile generator; scp to EC2 and run |
| `setup_openvpn_server.sh` | Earlier draft; kept for reference |
| `main.tf` | Terraform EC2 + security-group definition |

---

## 4. Server Deployment Procedure

### 4.1 Prerequisites

- EC2 reachable via `openvpn-key.pem` or AWS Systems Manager (SSM)
- Security group `sg-0ec3c5548c5af11d9` allows inbound TCP `443` from `0.0.0.0/0`
- Outbound internet available on EC2

### 4.2 Run setup script

```bash
# Upload and execute from local machine:
scp -i openvpn-key.pem openvpn_setup.sh ec2-user@54.254.169.193:/home/ec2-user/
ssh -i openvpn-key.pem ec2-user@54.254.169.193 \
  'chmod +x openvpn_setup.sh && ./openvpn_setup.sh 54.254.169.193'

# Download generated client profile:
scp -i openvpn-key.pem ec2-user@54.254.169.193:/home/ec2-user/client-openvpn.ovpn ./
```

What `openvpn_setup.sh` does:
1. Installs OpenVPN via `yum` if not present.
2. Generates `/etc/openvpn/server/static.key` (2048-bit).
3. Writes `/etc/openvpn/server/server.conf` with TCP 443, NAT, and IP forwarding.
4. Enables and starts `openvpn-server@server` (falls back to `openvpn@server`).
5. Writes `~/client-openvpn.ovpn` with the static key embedded inline.

### 4.3 Verify server is running

```bash
ssh -i openvpn-key.pem ec2-user@54.254.169.193 \
  'sudo systemctl is-active openvpn-server@server && sudo ss -lntp | grep :443'
```

Expected: `active` and a listener on `0.0.0.0:443`.

---

## 5. Client Profile Reference

File: `client-openvpn.ovpn`

```ini
mode p2p
dev tun
proto tcp-client
remote 54.254.169.193 443
nobind
allow-deprecated-insecure-static-crypto   # required for OpenVPN 2.6+
persist-key
persist-tun
cipher AES-256-CBC
auth SHA256
ifconfig 10.8.0.2 10.8.0.1
redirect-gateway def1                     # full tunnel: all traffic via VPN
dhcp-option DNS 8.8.8.8                   # override local DNS
dhcp-option DNS 1.1.1.1
tun-mtu 1500
mssfix 1400                               # prevent TCP-over-TCP fragmentation
verb 3
<secret>
...2048-bit static key...
</secret>
```

**Critical:** do **not** include the `client` directive. It triggers TLS mode and conflicts with static-key mode, producing `Bad encapsulated packet length` errors.

---

## 6. macOS Setup and Usage — vpn.sh (Recommended)

`vpn.sh` wraps all OpenVPN operations into simple subcommands with colour output and auto-verification.

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
| `./vpn.sh connect` | Start VPN, wait for handshake, print public IP |
| `./vpn.sh disconnect` | Kill VPN process, show real IP |
| `./vpn.sh toggle` | Connect if off, disconnect if on |
| `./vpn.sh status` | Show connected/disconnected state + current public IP |
| `./vpn.sh log` | Live-tail OpenVPN log (`Ctrl-C` to stop) |

Aliases: `on`/`up` for connect, `off`/`down` for disconnect, `s` for status, `l` for log.

### 6.3 What connect looks like

```
Connecting…
...............
Connected!
● VPN connected  (pid 12345)
  Public IP : 54.254.169.193
  Log       : /tmp/openvpn-client.log
```

### 6.4 What status looks like

```bash
$ ./vpn.sh status
● VPN connected  (pid 12345)
  Public IP : 54.254.169.193

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
curl ifconfig.me    # should return 54.254.169.193

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
5. Verify: open a browser and check `ifconfig.me` — it should show `54.254.169.193`.

> **Note:** iPhone OpenVPN Connect handles `allow-deprecated-insecure-static-crypto` transparently; no extra steps needed.

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

## 10. Operational Checks

### Server

```bash
# SSH in
ssh -i openvpn-key.pem ec2-user@54.254.169.193

# Service status
sudo systemctl status openvpn-server@server --no-pager

# Recent logs
sudo journalctl -u openvpn-server@server -n 50 --no-pager

# Confirm port 443 is listening
sudo ss -lntp | grep :443

# Active tunnel connections
sudo ip addr show tun0

# NAT rules (should see MASQUERADE)
sudo iptables -t nat -L POSTROUTING -n -v
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
curl ifconfig.me          # expect 54.254.169.193

# DNS check (should resolve via tunnel DNS, not local router)
nslookup youtube.com      # expect non-192.168.x.x resolver
```

---

## 11. Security Notes

- **Static-key mode** is operationally simple but provides no forward secrecy. If the key is compromised, past captured traffic can be decrypted. Prefer certificate/TLS mode for production deployments.
- **`client-openvpn.ovpn` contains the secret key.** Keep it `chmod 600`. Never commit it to a public repo.
- **Rotate the static key** if the profile is shared, lost, or copied beyond the intended device:
  ```bash
  ssh -i openvpn-key.pem ec2-user@54.254.169.193 'sudo \
    openvpn --genkey secret /etc/openvpn/server/static.key && \
    sudo systemctl restart openvpn-server@server'
  # Then regenerate client-openvpn.ovpn
  ```
- **`openvpn-key.pem`** gives SSH access to the EC2 instance. Keep it `chmod 400`.
- Security group `sg-0ec3c5548c5af11d9` allows TCP 443 from `0.0.0.0/0`. Restricting to your known IP ranges improves posture if static IPs are available.

---

## 12. Fast Recovery Procedure

### Client can't connect

```bash
# 1. Check the log for the error
./vpn.sh log
# or
tail -30 /tmp/openvpn-client.log

# 2. Confirm server is alive and listening
curl --max-time 5 -s "http://54.254.169.193:443" || echo "port open (connection refused = good)"

# 3. Re-run setup to regenerate server + profile if needed
scp -i openvpn-key.pem openvpn_setup.sh ec2-user@54.254.169.193:~/
ssh -i openvpn-key.pem ec2-user@54.254.169.193 './openvpn_setup.sh 54.254.169.193'
scp -i openvpn-key.pem ec2-user@54.254.169.193:~/client-openvpn.ovpn ./

# 4. Reconnect
./vpn.sh connect
```

### Server IP changed (EC2 stop/start)

```bash
# Get new IP
eval "$(aws configure export-credentials --profile default --format env)"
NEW_IP=$(aws ec2 describe-instances --region ap-southeast-1 \
  --instance-ids i-09e463ef599031fe7 \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo "New IP: $NEW_IP"

# Update client profile
sed -i '' "s/remote .* 443/remote $NEW_IP 443/" client-openvpn.ovpn

# Reconnect
./vpn.sh connect
```

### Service not running on server

```bash
ssh -i openvpn-key.pem ec2-user@54.254.169.193 \
  'sudo systemctl restart openvpn-server@server && \
   sudo systemctl status openvpn-server@server --no-pager'
```
