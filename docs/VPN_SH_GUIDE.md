# vpn.sh Quick Guide

Simple setup and daily usage for macOS and Windows.

## Setup

1. Install OpenVPN:

~~~bash
brew install openvpn
~~~

On Windows, install OpenVPN Community client (openvpn.exe).

2. Keep these files in the same folder:
- `vpn.sh`
- `client-openvpn-tcp.ovpn` (default)
- `client-openvpn-udp.ovpn` (optional)

3. Make script executable:

~~~bash
chmod +x ./vpn.sh
~~~

Windows entry points:
- PowerShell: `./vpn.ps1`
- CMD: `vpn.cmd`
- Git Bash: `./vpn.sh`

## Core Usage

~~~bash
./vpn.sh connect        # connect with TCP (default)
./vpn.sh connect udp    # optional UDP mode
./vpn.sh off            # disconnect
./vpn.sh status         # show state + public IP
./vpn.sh log            # tail OpenVPN log
./vpn.sh speed          # test current route speed
./vpn.sh speed udp      # test UDP path (auto connect/disconnect)
./vpn.sh speed tcp      # test TCP path (auto connect/disconnect)
~~~

PowerShell examples:

~~~powershell
.\vpn.ps1 connect
.\vpn.ps1 connect udp
.\vpn.ps1 status
.\vpn.ps1 disconnect
~~~

CMD examples:

~~~bat
vpn.cmd connect
vpn.cmd connect udp
vpn.cmd status
vpn.cmd disconnect
~~~

## Command Reference

- `connect [udp|tcp]` (aliases: `on`, `up`)
- `disconnect` (aliases: `off`, `down`)
- `toggle`
- `status` (`s`)
- `log` (`l`)
- `sync`
- `speed [current|udp|tcp]` (`test-speed`)
- `help`, `-h`, `--help`

## Notes

- `connect` defaults to TCP.
- `connect` now pins macOS DNS to `1.1.1.1` + `8.8.8.8` while VPN is up.
- `disconnect` restores your original macOS DNS settings automatically.
- `connect` also adds temporary host routes for common WeChat/QQ domains via local gateway, then removes them on disconnect.
- DNS pinning and bypass host-routes are macOS-only behaviors.
- WeChat/QQ bypass DNS lookups use short timeouts; if DNS is unstable, `connect` continues instead of hanging.
- `speed udp` and `speed tcp` temporarily switch protocol if needed, then restore your previous VPN state.
- If Terraform is available, `connect`/`sync` auto-updates profile endpoint IP.

## Quick Troubleshooting

- OpenVPN not found: run `brew install openvpn`.
- Profile missing: ensure UDP/TCP profile files are next to `vpn.sh`.
- Connection issue: run `./vpn.sh log`.
