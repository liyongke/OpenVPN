#!/usr/bin/env bash
# vpn.sh — OpenVPN connect/disconnect/status helper
# Usage: ./vpn.sh [connect|disconnect|status|log|toggle|sync|speed] [udp|tcp]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_UDP="$SCRIPT_DIR/client-openvpn-udp.ovpn"
CONFIG_TCP="$SCRIPT_DIR/client-openvpn-tcp.ovpn"
CONFIG_LEGACY="$SCRIPT_DIR/client-openvpn.ovpn"
OPENVPN="/opt/homebrew/sbin/openvpn"
PID_FILE="/tmp/openvpn-client.pid"
LOG_FILE="/tmp/openvpn-client.log"
DNS_BACKUP_FILE="/tmp/vpn-sh-dns-backup"
BYPASS_ROUTE_FILE="/tmp/vpn-sh-bypass-routes"
DEFAULT_PROTOCOL="udp"

VPN_DNS_SERVERS=("1.1.1.1" "8.8.8.8")
APP_BYPASS_DOMAINS=(
  "wechat.com"
  "weixin.qq.com"
  "wx.qq.com"
  "qq.com"
  "qlogo.cn"
  "gtimg.com"
  "tenpay.com"
)

ACTIVE_CONFIG=""
ACTIVE_PROTOCOL=""

# ── colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── helpers ────────────────────────────────────────────────────────────────────
pid_is_openvpn() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  ps -p "$pid" -o command= 2>/dev/null | grep -q "openvpn"
}

find_openvpn_pid() {
  local pid=""

  # Prefer PID from file when it points to an OpenVPN process.
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if pid_is_openvpn "$pid"; then
      echo "$pid"
      return 0
    fi
  fi

  # Fallback: find any OpenVPN process using known client profiles.
  pid="$(pgrep -f "openvpn.*client-openvpn" | head -n1 || true)"
  if pid_is_openvpn "$pid"; then
    echo "$pid"
    return 0
  fi

  return 1
}

is_running() {
  find_openvpn_pid >/dev/null 2>&1
}

public_ip() {
  local ip=""
  local endpoint=""

  for endpoint in \
    "https://checkip.amazonaws.com" \
    "https://api.ipify.org" \
    "https://ifconfig.me/ip" \
    "https://icanhazip.com"; do
    ip="$(curl -4 -fsS --connect-timeout 2 --max-time 4 "$endpoint" 2>/dev/null | tr -d '[:space:]' || true)"
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "$ip"
      return 0
    fi
  done

  echo "unavailable"
}

log_has() {
  local pattern="$1"
  sudo grep -q "$pattern" "$LOG_FILE" 2>/dev/null
}

active_default_interface() {
  route -n get default 2>/dev/null | awk '/interface: / {print $2; exit}'
}

network_service_for_interface() {
  local iface="$1"
  networksetup -listnetworkserviceorder 2>/dev/null | awk -v dev="$iface" '
    /^\([0-9]+\)/ { svc=$0; sub(/^\([0-9]+\) /, "", svc) }
    /Device: / {
      if (index($0, "Device: " dev ")") > 0) {
        print svc
        exit
      }
    }
  '
}

active_network_service() {
  local iface=""
  local service=""

  iface="$(active_default_interface || true)"
  [[ -n "$iface" ]] || { echo "Wi-Fi"; return 0; }

  service="$(network_service_for_interface "$iface" || true)"
  if [[ -n "$service" ]]; then
    echo "$service"
  else
    echo "Wi-Fi"
  fi
}

flush_dns_cache() {
  sudo dscacheutil -flushcache >/dev/null 2>&1 || true
  sudo killall -HUP mDNSResponder >/dev/null 2>&1 || true
}

backup_dns_state() {
  local service="$1"
  local dns_raw=""

  dns_raw="$(networksetup -getdnsservers "$service" 2>/dev/null || true)"

  {
    echo "service=$service"
    if [[ "$dns_raw" == There\ aren\'*\ DNS\ Servers\ set* ]]; then
      echo "mode=AUTO"
    else
      echo "mode=MANUAL"
      echo "dns=$dns_raw" | tr '\n' ',' | sed 's/,$//'
    fi
  } > "$DNS_BACKUP_FILE"
}

apply_vpn_dns() {
  local service=""
  service="$(active_network_service)"

  backup_dns_state "$service"
  sudo networksetup -setdnsservers "$service" "${VPN_DNS_SERVERS[@]}" >/dev/null
  flush_dns_cache

  echo -e "${CYAN}DNS pinned on ${service}: ${VPN_DNS_SERVERS[*]}${RESET}"
}

restore_dns_state() {
  [[ -f "$DNS_BACKUP_FILE" ]] || return 0

  local service=""
  local mode=""
  local dns_csv=""

  service="$(awk -F'=' '/^service=/{print $2}' "$DNS_BACKUP_FILE" | head -n1)"
  mode="$(awk -F'=' '/^mode=/{print $2}' "$DNS_BACKUP_FILE" | head -n1)"
  dns_csv="$(awk -F'=' '/^dns=/{print $2}' "$DNS_BACKUP_FILE" | head -n1)"

  if [[ -n "$service" ]]; then
    if [[ "$mode" == "AUTO" || -z "$dns_csv" ]]; then
      sudo networksetup -setdnsservers "$service" Empty >/dev/null 2>&1 || true
      echo -e "${CYAN}DNS restored on ${service}: automatic${RESET}"
    else
      local dns_servers=()
      IFS=',' read -r -A dns_servers <<< "$dns_csv"
      sudo networksetup -setdnsservers "$service" "${dns_servers[@]}" >/dev/null 2>&1 || true
      echo -e "${CYAN}DNS restored on ${service}: ${dns_servers[*]}${RESET}"
    fi
    flush_dns_cache
  fi

  rm -f "$DNS_BACKUP_FILE"
}

resolve_domain_ipv4() {
  local domain="$1"
  dig +short A "$domain" 2>/dev/null | awk '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/' | head -n 4
}

apply_app_bypass_routes() {
  local gw=""
  local d=""
  local ip=""
  local added=0

  gw="$(route -n get default 2>/dev/null | awk '/gateway: / {print $2; exit}')"
  [[ -n "$gw" ]] || return 0

  : > "$BYPASS_ROUTE_FILE"

  for d in "${APP_BYPASS_DOMAINS[@]}"; do
    while read -r ip; do
      [[ -n "$ip" ]] || continue
      sudo route -n add -host "$ip" "$gw" >/dev/null 2>&1 || true
      echo "$ip,$gw" >> "$BYPASS_ROUTE_FILE"
      added=1
    done < <(resolve_domain_ipv4 "$d")
  done

  if [[ "$added" -eq 1 ]]; then
    echo -e "${CYAN}Applied app bypass routes via ${gw} for WeChat/QQ domains.${RESET}"
  fi
}

restore_app_bypass_routes() {
  [[ -f "$BYPASS_ROUTE_FILE" ]] || return 0

  local line=""
  local ip=""
  local gw=""

  while read -r line; do
    [[ -n "$line" ]] || continue
    ip="${line%%,*}"
    gw="${line##*,}"
    sudo route -n delete -host "$ip" "$gw" >/dev/null 2>&1 || sudo route -n delete -host "$ip" >/dev/null 2>&1 || true
  done < "$BYPASS_ROUTE_FILE"

  rm -f "$BYPASS_ROUTE_FILE"
}

normalize_protocol() {
  local requested="${1:-$DEFAULT_PROTOCOL}"
  case "$requested" in
    udp|UDP) echo "udp" ;;
    tcp|TCP) echo "tcp" ;;
    *)
      echo -e "${RED}Invalid protocol: ${requested}. Use udp or tcp.${RESET}" >&2
      exit 1
      ;;
  esac
}

set_active_profile() {
  local protocol
  protocol="$(normalize_protocol "${1:-$DEFAULT_PROTOCOL}")"

  ACTIVE_PROTOCOL="$protocol"
  ACTIVE_CONFIG=""

  if [[ "$protocol" == "udp" ]]; then
    if [[ -f "$CONFIG_UDP" ]]; then
      ACTIVE_CONFIG="$CONFIG_UDP"
    elif [[ -f "$CONFIG_LEGACY" ]]; then
      ACTIVE_CONFIG="$CONFIG_LEGACY"
    fi
  else
    if [[ -f "$CONFIG_TCP" ]]; then
      ACTIVE_CONFIG="$CONFIG_TCP"
    elif [[ -f "$CONFIG_LEGACY" ]]; then
      ACTIVE_CONFIG="$CONFIG_LEGACY"
    fi
  fi

  if [[ -z "$ACTIVE_CONFIG" ]]; then
    echo -e "${RED}No client profile found for protocol ${protocol}.${RESET}" >&2
    echo "Expected one of:"
    [[ "$protocol" == "udp" ]] && echo "  - $CONFIG_UDP"
    [[ "$protocol" == "tcp" ]] && echo "  - $CONFIG_TCP"
    echo "  - $CONFIG_LEGACY"
    exit 1
  fi
}

sync_openvpn_endpoints() {
  command -v terraform >/dev/null 2>&1 || return 0

  local tf_ip=""
  tf_ip="$(cd "$SCRIPT_DIR" && terraform output -raw vpn_server_public_ip 2>/dev/null || true)"
  [[ -n "$tf_ip" ]] || return 0

  local cfg=""
  local current_ip=""
  local updated=0
  local found=0

  for cfg in "$CONFIG_UDP" "$CONFIG_TCP" "$CONFIG_LEGACY"; do
    [[ -f "$cfg" ]] || continue
    found=1
    current_ip="$(awk '/^remote / {print $2; exit}' "$cfg" 2>/dev/null || true)"
    if [[ "$current_ip" == "$tf_ip" ]]; then
      continue
    fi

    cp "$cfg" "$cfg.bak"
    sed -i '' -E "s/^remote [^ ]+ ([0-9]+)$/remote ${tf_ip} \1/" "$cfg"
    echo -e "${CYAN}Updated OpenVPN endpoint in $(basename "$cfg") -> ${tf_ip}${RESET}"
    updated=1
  done

  [[ "$found" -eq 1 ]] || return 0
  [[ "$updated" -eq 1 ]] || true
}

detect_active_protocol() {
  local pid=""
  pid="$(find_openvpn_pid || true)"
  [[ -n "$pid" ]] || { echo "unknown"; return 0; }

  local cmdline=""
  cmdline="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [[ "$cmdline" == *"client-openvpn-tcp.ovpn"* ]]; then
    echo "tcp"
  elif [[ "$cmdline" == *"client-openvpn-udp.ovpn"* ]]; then
    echo "udp"
  elif [[ "$cmdline" == *"--proto tcp-client"* ]]; then
    echo "tcp"
  elif [[ "$cmdline" == *"--proto udp"* ]]; then
    echo "udp"
  else
    echo "unknown"
  fi
}

cmd_status() {
  if is_running; then
    local pid
    pid="$(find_openvpn_pid)"
    local proto
    proto="$(detect_active_protocol)"
    local ip
    ip=$(public_ip)
    echo -e "${GREEN}${BOLD}● VPN connected${RESET}  (pid $pid)"
    echo -e "  Protocol  : ${CYAN}${proto}${RESET}"
    echo -e "  Public IP : ${CYAN}${ip}${RESET}"
    echo -e "  Log       : $LOG_FILE"
  else
    [[ -f "$PID_FILE" ]] && rm -f "$PID_FILE"
    echo -e "${RED}${BOLD}○ VPN disconnected${RESET}"
    local ip
    ip=$(public_ip)
    echo -e "  Public IP : ${YELLOW}${ip}${RESET}  (your real IP)"
  fi
}

cmd_connect() {
  local requested_protocol="${1:-$DEFAULT_PROTOCOL}"

  set_active_profile "$requested_protocol"
  sync_openvpn_endpoints

  if is_running; then
    echo -e "${YELLOW}Already connected.${RESET}"
    cmd_status
    return
  fi

  if [[ ! -x "$OPENVPN" ]]; then
    echo -e "${RED}openvpn binary not found: $OPENVPN${RESET}" >&2
    echo "Install with: brew install openvpn"
    exit 1
  fi

  echo -e "${CYAN}Connecting using ${ACTIVE_PROTOCOL} profile ($(basename "$ACTIVE_CONFIG"))...${RESET}"
  sudo "$OPENVPN" \
    --config "$ACTIVE_CONFIG" \
    --daemon \
    --writepid "$PID_FILE" \
    --log "$LOG_FILE"

  # Wait up to 15s for "Initialization Sequence Completed"
  local i=0
  while (( i < 15 )); do
    sleep 1 && (( i++ ))
    if log_has "Initialization Sequence Completed"; then
      apply_vpn_dns
      apply_app_bypass_routes
      echo -e "${GREEN}${BOLD}Connected!${RESET}"
      cmd_status
      return
    fi
    if log_has "AUTH_FAILED\|TLS Error\|Connection refused\|SIGTERM\|decryption-error"; then
      echo -e "${RED}Connection failed. Last log lines:${RESET}"
      sudo tail -10 "$LOG_FILE"
      exit 1
    fi
    printf '.'
  done
  echo ""
  echo -e "${YELLOW}Timed out waiting — check log: tail -f $LOG_FILE${RESET}"
}

cmd_disconnect() {
  local pid
  pid="$(find_openvpn_pid || true)"

  if [[ -z "$pid" ]]; then
    [[ -f "$PID_FILE" ]] && rm -f "$PID_FILE"
    restore_app_bypass_routes
    restore_dns_state
    echo -e "${YELLOW}VPN is not running.${RESET}"
    return
  fi

  echo -e "${CYAN}Disconnecting (pid $pid)…${RESET}"
  sudo kill "$pid" 2>/dev/null || true
  sleep 1

  # Force stop if still alive.
  if pid_is_openvpn "$pid"; then
    sudo kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$PID_FILE"
  restore_app_bypass_routes
  restore_dns_state
  echo -e "${RED}${BOLD}Disconnected.${RESET}"
  echo -e "  Public IP : ${YELLOW}$(public_ip)${RESET}  (your real IP)"
}

cmd_toggle() {
  if is_running; then
    cmd_disconnect
  else
    cmd_connect
  fi
}

cmd_log() {
  echo -e "${CYAN}Tailing $LOG_FILE  (Ctrl-C to stop)${RESET}"
  sudo tail -f "$LOG_FILE"
}

cmd_sync() {
  sync_openvpn_endpoints
  echo -e "${GREEN}OpenVPN profile sync complete.${RESET}"
}

run_speed_sample() {
  local test_urls=(
    "https://speed.cloudflare.com/__down?bytes=10000000"
    "https://proof.ovh.net/files/10Mb.dat"
    "https://speed.hetzner.de/10MB.bin"
    "https://ipv4.download.thinkbroadband.com/10MB.zip"
  )
  local probe_url="https://www.cloudflare.com/cdn-cgi/trace"

  # Probe latency-ish timing via HTTPS handshake/request path.
  local probe_stats=""
  probe_stats="$(curl -4 -L -o /dev/null -sS --connect-timeout 5 --max-time 20 \
    -w '%{time_connect} %{time_starttransfer} %{time_total}' "$probe_url" 2>/dev/null || true)"

  local connect_s="" ttfb_s="" total_s=""
  connect_s="$(echo "$probe_stats" | awk '{print $1}')"
  ttfb_s="$(echo "$probe_stats" | awk '{print $2}')"
  total_s="$(echo "$probe_stats" | awk '{print $3}')"

  local dl_stats=""
  local speed_bps="" dl_total_s=""
  local u=""
  for u in "${test_urls[@]}"; do
    dl_stats="$(curl -4 -L -o /dev/null -sS --connect-timeout 5 --max-time 90 \
      -w '%{speed_download} %{time_total}' "$u" 2>/dev/null || true)"
    speed_bps="$(echo "$dl_stats" | awk '{print $1}')"
    dl_total_s="$(echo "$dl_stats" | awk '{print $2}')"
    if [[ -n "$speed_bps" && "$speed_bps" != "0" ]]; then
      break
    fi
  done

  if [[ -z "$speed_bps" || "$speed_bps" == "0" ]]; then
    return 1
  fi

  local mbps=""
  mbps="$(awk -v bps="$speed_bps" 'BEGIN { printf "%.2f", (bps * 8) / 1000000 }')"

  local connect_ms="n/a" ttfb_ms="n/a"
  if [[ -n "$connect_s" && "$connect_s" != "0" ]]; then
    connect_ms="$(awk -v s="$connect_s" 'BEGIN { printf "%.0f", s * 1000 }')"
  fi
  if [[ -n "$ttfb_s" && "$ttfb_s" != "0" ]]; then
    ttfb_ms="$(awk -v s="$ttfb_s" 'BEGIN { printf "%.0f", s * 1000 }')"
  fi

  local ip=""
  ip="$(public_ip)"

  echo "${ip}|${connect_ms}|${ttfb_ms}|${mbps}|${dl_total_s}"
}

cmd_speed() {
  local target="${1:-current}"
  local state="disconnected"
  local proto="n/a"

  if is_running; then
    state="connected"
    proto="$(detect_active_protocol)"
  fi

  local original_running=0
  local original_proto=""
  local temporary_connect=0
  local switched_proto=0

  if [[ "$state" == "connected" ]]; then
    original_running=1
    original_proto="$proto"
  fi

  case "$target" in
    current)
      ;;
    udp|tcp)
      echo -e "${CYAN}Preparing speed test on ${target}...${RESET}"
      if [[ "$original_running" -eq 0 ]]; then
        cmd_connect "$target"
        temporary_connect=1
      elif [[ "$original_proto" != "$target" ]]; then
        cmd_disconnect
        cmd_connect "$target"
        switched_proto=1
      fi
      state="connected"
      proto="$(detect_active_protocol)"
      ;;
    *)
      echo -e "${RED}Invalid speed mode: ${target}.${RESET}" >&2
      echo "Use: ./vpn.sh speed [current|udp|tcp]"
      exit 1
      ;;
  esac

  echo -e "${CYAN}Running speed test (${state}, protocol: ${proto})...${RESET}"

  local result=""
  result="$(run_speed_sample || true)"

  if [[ "$temporary_connect" -eq 1 ]]; then
    cmd_disconnect
  elif [[ "$switched_proto" -eq 1 ]]; then
    cmd_disconnect
    if [[ "$original_proto" == "udp" || "$original_proto" == "tcp" ]]; then
      cmd_connect "$original_proto"
    else
      cmd_connect "$DEFAULT_PROTOCOL"
    fi
  fi

  if [[ -z "$result" ]]; then
    echo -e "${RED}Speed test failed.${RESET}"
    echo "Try again in a few seconds, or run protocol-specific tests: ./vpn.sh speed udp and ./vpn.sh speed tcp"
    exit 1
  fi

  local ip="" connect_ms="" ttfb_ms="" mbps="" sample_s=""
  ip="$(echo "$result" | awk -F'|' '{print $1}')"
  connect_ms="$(echo "$result" | awk -F'|' '{print $2}')"
  ttfb_ms="$(echo "$result" | awk -F'|' '{print $3}')"
  mbps="$(echo "$result" | awk -F'|' '{print $4}')"
  sample_s="$(echo "$result" | awk -F'|' '{print $5}')"

  echo -e "${GREEN}${BOLD}Speed test result${RESET}"
  printf "  %-12s : %s\n" "Mode" "$target"
  printf "  %-12s : %s\n" "Route state" "$state"
  printf "  %-12s : %s\n" "VPN proto" "$proto"
  printf "  %-12s : %s\n" "Public IP" "$ip"
  printf "  %-12s : %s ms\n" "Connect" "$connect_ms"
  printf "  %-12s : %s ms\n" "TTFB" "$ttfb_ms"
  printf "  %-12s : %s Mbps\n" "Download" "$mbps"
  [[ -n "$sample_s" ]] && printf "  %-12s : %s s (10 MB)\n" "Sample time" "$sample_s"
  echo ""
  echo "Tips: run './vpn.sh speed udp' and './vpn.sh speed tcp' back-to-back to compare transport performance."
}

cmd_help() {
  echo -e "${BOLD}Usage:${RESET} $(basename "$0") {connect|on|disconnect|off|down|toggle|status|log|sync|speed} [udp|tcp]"
  echo ""
  echo "  connect/on [udp|tcp]       Start the VPN (default: udp)"
  echo "  disconnect/off/down        Stop the VPN"
  echo "  toggle                     Connect if off, disconnect if on"
  echo "  status                     Show connection state + public IP"
  echo "  log                        Live-tail the OpenVPN log"
  echo "  sync                       Update local client endpoint from Terraform output"
  echo "  speed [current|udp|tcp]   Run latency + download speed test"
  echo ""
  echo "Notes:"
  echo "  - connect also pins DNS to 1.1.1.1 + 8.8.8.8, then restores your original DNS on disconnect"
  echo "  - connect also adds temporary bypass routes for WeChat/QQ domains via local gateway"
}

# ── dispatch ───────────────────────────────────────────────────────────────────
case "${1:-status}" in
  connect|up|on)       cmd_connect "${2:-$DEFAULT_PROTOCOL}" ;;
  disconnect|down|off) cmd_disconnect ;;
  toggle)              cmd_toggle     ;;
  status|s)            cmd_status     ;;
  log|l)               cmd_log        ;;
  sync)                cmd_sync       ;;
  speed|test-speed)    cmd_speed "${2:-current}" ;;
  help|-h|--help)      cmd_help       ;;
  *)
    cmd_help
    exit 1
    ;;
esac
