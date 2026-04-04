#!/usr/bin/env bash
set -euo pipefail

sudo yum install -y openvpn easy-rsa
sudo mkdir -p /etc/openvpn

if [[ ! -f /etc/openvpn/static.key ]]; then
  sudo openvpn --genkey --secret /etc/openvpn/static.key
fi

sudo tee /etc/openvpn/server.conf >/dev/null <<'EOF'
port 443
proto tcp-server
dev tun
ifconfig 10.9.0.1 10.9.0.2
secret /etc/openvpn/static.key
cipher AES-256-CBC
auth SHA256
keepalive 10 60
persist-key
persist-tun
user nobody
group nobody
verb 3
EOF

sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
sudo sed -i '/^net.ipv4.ip_forward=/d' /etc/sysctl.conf
printf 'net.ipv4.ip_forward=1\n' | sudo tee -a /etc/sysctl.conf >/dev/null

IFACE="$(ip route show default 2>/dev/null | awk '{print $5; exit}')"
if [[ -z "$IFACE" ]]; then
  IFACE=eth0
fi
echo "Using outbound interface for NAT: $IFACE"
sudo iptables -t nat -C POSTROUTING -s 10.9.0.0/24 -o "$IFACE" -j MASQUERADE || sudo iptables -t nat -A POSTROUTING -s 10.9.0.0/24 -o "$IFACE" -j MASQUERADE
sudo iptables -C FORWARD -s 10.9.0.0/24 -j ACCEPT || sudo iptables -A FORWARD -s 10.9.0.0/24 -j ACCEPT
sudo iptables -C FORWARD -d 10.9.0.0/24 -m state --state RELATED,ESTABLISHED -j ACCEPT || sudo iptables -A FORWARD -d 10.9.0.0/24 -m state --state RELATED,ESTABLISHED -j ACCEPT

sudo systemctl enable openvpn@server
sudo systemctl restart openvpn@server
sudo systemctl is-active openvpn@server
sudo ss -lntp | grep ':443'
