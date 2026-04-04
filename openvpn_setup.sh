#!/bin/bash
set -euo pipefail

SERVER_IP="${1:?Usage: ./openvpn_setup.sh <server-public-ip>}"
CLIENT_NAME="client-openvpn"

if ! command -v openvpn >/dev/null 2>&1; then
  if command -v amazon-linux-extras >/dev/null 2>&1; then
    sudo amazon-linux-extras install -y epel || true
  fi
  sudo yum clean metadata || true
  sudo yum install -y openvpn openssl
fi

sudo mkdir -p /etc/openvpn/pki/private /etc/openvpn/pki/issued

# Build a minimal PKI (CA/server/client) for OpenVPN Connect compatibility.
if [[ ! -f /etc/openvpn/pki/ca.crt ]]; then
  sudo openssl genrsa -out /etc/openvpn/pki/private/ca.key 4096
  sudo openssl req -x509 -new -nodes \
    -key /etc/openvpn/pki/private/ca.key \
    -sha256 -days 3650 \
    -subj "/CN=OpenVPN-CA" \
    -out /etc/openvpn/pki/ca.crt
fi

sudo openssl genrsa -out /etc/openvpn/pki/private/server.key 2048
sudo openssl req -new -key /etc/openvpn/pki/private/server.key -subj "/CN=${SERVER_IP}" -out /tmp/server.csr
cat <<EOF | sudo tee /tmp/server_ext.cnf >/dev/null
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:${SERVER_IP}
EOF
sudo openssl x509 -req -in /tmp/server.csr \
  -CA /etc/openvpn/pki/ca.crt -CAkey /etc/openvpn/pki/private/ca.key -CAcreateserial \
  -out /etc/openvpn/pki/issued/server.crt -days 1825 -sha256 -extfile /tmp/server_ext.cnf

sudo openssl genrsa -out "/etc/openvpn/pki/private/${CLIENT_NAME}.key" 2048
sudo openssl req -new -key "/etc/openvpn/pki/private/${CLIENT_NAME}.key" -subj "/CN=${CLIENT_NAME}" -out /tmp/client.csr
cat <<'EOF' | sudo tee /tmp/client_ext.cnf >/dev/null
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
EOF
sudo openssl x509 -req -in /tmp/client.csr \
  -CA /etc/openvpn/pki/ca.crt -CAkey /etc/openvpn/pki/private/ca.key -CAcreateserial \
  -out "/etc/openvpn/pki/issued/${CLIENT_NAME}.crt" -days 1825 -sha256 -extfile /tmp/client_ext.cnf

sudo openvpn --genkey --secret /etc/openvpn/pki/ta.key
sudo chmod 600 /etc/openvpn/pki/private/*.key /etc/openvpn/pki/ta.key

cat <<'EOF' | sudo tee /etc/openvpn/server-udp.conf >/dev/null
port 443
proto udp
dev tun
topology subnet
server 10.8.0.0 255.255.255.0
ifconfig-pool-persist /etc/openvpn/ipp-udp.txt
push "redirect-gateway def1"
push "dhcp-option DNS 8.8.8.8"
push "dhcp-option DNS 1.1.1.1"
keepalive 10 60
persist-key
persist-tun
user nobody
group nobody
ca /etc/openvpn/pki/ca.crt
cert /etc/openvpn/pki/issued/server.crt
key /etc/openvpn/pki/private/server.key
dh none
ecdh-curve prime256v1
tls-crypt /etc/openvpn/pki/ta.key
tls-version-min 1.2
cipher AES-256-GCM
auth SHA256
tun-mtu 1500
mssfix 1400
verb 3
EOF

cat <<'EOF' | sudo tee /etc/openvpn/server-tcp.conf >/dev/null
port 443
proto tcp-server
dev tun
topology subnet
server 10.9.0.0 255.255.255.0
ifconfig-pool-persist /etc/openvpn/ipp-tcp.txt
push "redirect-gateway def1"
push "dhcp-option DNS 8.8.8.8"
push "dhcp-option DNS 1.1.1.1"
keepalive 10 60
persist-key
persist-tun
user nobody
group nobody
ca /etc/openvpn/pki/ca.crt
cert /etc/openvpn/pki/issued/server.crt
key /etc/openvpn/pki/private/server.key
dh none
ecdh-curve prime256v1
tls-crypt /etc/openvpn/pki/ta.key
tls-version-min 1.2
cipher AES-256-GCM
auth SHA256
tun-mtu 1500
mssfix 1400
verb 3
EOF

sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
sudo sed -i '/^net.ipv4.ip_forward=/d' /etc/sysctl.conf
echo 'net.ipv4.ip_forward=1' | sudo tee -a /etc/sysctl.conf >/dev/null

IFACE="$(ip route show default 2>/dev/null | awk '{print $5; exit}')"
if [[ -z "$IFACE" ]]; then
  IFACE="eth0"
fi
echo "Using outbound interface for NAT: ${IFACE}"

sudo iptables -t nat -C POSTROUTING -s 10.8.0.0/24 -o "$IFACE" -j MASQUERADE 2>/dev/null || \
  sudo iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o "$IFACE" -j MASQUERADE
sudo iptables -t nat -C POSTROUTING -s 10.9.0.0/24 -o "$IFACE" -j MASQUERADE 2>/dev/null || \
  sudo iptables -t nat -A POSTROUTING -s 10.9.0.0/24 -o "$IFACE" -j MASQUERADE
sudo iptables -C FORWARD -i tun+ -j ACCEPT 2>/dev/null || \
  sudo iptables -A FORWARD -i tun+ -j ACCEPT
sudo iptables -C FORWARD -o tun+ -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || \
  sudo iptables -A FORWARD -o tun+ -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
sudo iptables -t mangle -C FORWARD -o tun+ -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || \
  sudo iptables -t mangle -A FORWARD -o tun+ -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
sudo iptables -t mangle -C FORWARD -i tun+ -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || \
  sudo iptables -t mangle -A FORWARD -i tun+ -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu

sudo systemctl disable --now openvpn-server@server 2>/dev/null || true
sudo systemctl disable --now openvpn@server 2>/dev/null || true
sudo systemctl enable openvpn@server-udp
sudo systemctl restart openvpn@server-udp
sudo systemctl enable openvpn@server-tcp
sudo systemctl restart openvpn@server-tcp

cat > "/home/ec2-user/${CLIENT_NAME}-udp.ovpn" <<EOF
client
dev tun
proto udp
remote ${SERVER_IP} 443
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
tun-mtu 1500
mssfix 1400
verb 3
<ca>
$(sudo cat /etc/openvpn/pki/ca.crt)
</ca>
<cert>
$(sudo cat /etc/openvpn/pki/issued/${CLIENT_NAME}.crt)
</cert>
<key>
$(sudo cat /etc/openvpn/pki/private/${CLIENT_NAME}.key)
</key>
<tls-crypt>
$(sudo cat /etc/openvpn/pki/ta.key)
</tls-crypt>
EOF

cat > "/home/ec2-user/${CLIENT_NAME}-tcp.ovpn" <<EOF
client
dev tun
proto tcp-client
remote ${SERVER_IP} 443
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
tun-mtu 1500
mssfix 1400
verb 3
<ca>
$(sudo cat /etc/openvpn/pki/ca.crt)
</ca>
<cert>
$(sudo cat /etc/openvpn/pki/issued/${CLIENT_NAME}.crt)
</cert>
<key>
$(sudo cat /etc/openvpn/pki/private/${CLIENT_NAME}.key)
</key>
<tls-crypt>
$(sudo cat /etc/openvpn/pki/ta.key)
</tls-crypt>
EOF

cp "/home/ec2-user/${CLIENT_NAME}-tcp.ovpn" "/home/ec2-user/${CLIENT_NAME}.ovpn"

chmod 600 "/home/ec2-user/${CLIENT_NAME}.ovpn" "/home/ec2-user/${CLIENT_NAME}-udp.ovpn" "/home/ec2-user/${CLIENT_NAME}-tcp.ovpn"

echo "=== STATUS ==="
sudo systemctl --no-pager --full status openvpn@server-udp | sed -n '1,20p'
sudo systemctl --no-pager --full status openvpn@server-tcp | sed -n '1,20p'
echo "=== LISTEN ==="
sudo ss -lnup | egrep ':443' || true
sudo ss -lntp | egrep ':443' || true
echo "=== DONE ==="
