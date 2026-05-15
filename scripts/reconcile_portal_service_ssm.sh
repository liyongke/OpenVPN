#!/usr/bin/env bash
set -euo pipefail

PROFILE="${AWS_PROFILE:-aws-login-session-2}"
REGION="${AWS_REGION:-ap-southeast-1}"
INSTANCE_ID="${1:-}"

APP_DIR="${APP_DIR:-/home/ec2-user/apps/vpn-portal-phase1-readonly}"
UNIT_PATH="/etc/systemd/system/vpn-portal-phase1.service"

if [[ -z "$INSTANCE_ID" ]]; then
  INSTANCE_ID="$(aws ec2 describe-instances \
    --profile "$PROFILE" \
    --region "$REGION" \
    --filters Name=tag:Name,Values=OpenVPN-Server Name=instance-state-name,Values=running \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text)"
fi

if [[ -z "$INSTANCE_ID" || "$INSTANCE_ID" == "None" ]]; then
  echo "ERROR: Could not resolve running OpenVPN-Server instance ID." >&2
  echo "Provide it explicitly: $0 <instance-id>" >&2
  exit 1
fi

read -r -d '' REMOTE_SCRIPT <<EOF || true
set -euo pipefail

APP_DIR="${APP_DIR}"
UNIT_PATH="${UNIT_PATH}"
BACKUP="\${UNIT_PATH}.bak.\$(date +%Y%m%d%H%M%S)"

if [[ -f "\$UNIT_PATH" ]]; then
  cp "\$UNIT_PATH" "\$BACKUP"
fi

cat > "\$UNIT_PATH" <<UNIT
[Unit]
Description=VPN Portal Phase1 ReadOnly
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=RUN_PORTAL_MANAGE_DEPS=0
ExecStart=${APP_DIR}/run_portal.sh
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

chown root:root "\$UNIT_PATH"
chmod 644 "\$UNIT_PATH"

systemctl daemon-reload
systemctl enable vpn-portal-phase1 >/dev/null
systemctl restart vpn-portal-phase1

echo "== service status =="
systemctl is-active vpn-portal-phase1
echo "== listener =="
ss -lntp | grep :8088 || true
echo "== execstart =="
systemctl show vpn-portal-phase1 -p ExecStart
echo "== backup =="
echo "\$BACKUP"
EOF

REMOTE_B64="$(printf '%s' "$REMOTE_SCRIPT" | base64 | tr -d '\n')"
PARAMETERS_JSON="$(cat <<EOF
{"commands":["echo '${REMOTE_B64}' | base64 -d >/tmp/reconcile_portal_service.sh && bash /tmp/reconcile_portal_service.sh"]}
EOF
)"

echo "Reconciling vpn-portal-phase1 on instance: ${INSTANCE_ID}"

COMMAND_ID="$(aws ssm send-command \
  --profile "$PROFILE" \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "Reconcile vpn-portal-phase1 systemd unit" \
  --parameters "$PARAMETERS_JSON" \
  --query 'Command.CommandId' \
  --output text)"

echo "SSM CommandId: ${COMMAND_ID}"

aws ssm wait command-executed \
  --profile "$PROFILE" \
  --region "$REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID"

aws ssm list-command-invocations \
  --profile "$PROFILE" \
  --region "$REGION" \
  --command-id "$COMMAND_ID" \
  --details \
  --query 'CommandInvocations[0].CommandPlugins[0].{Status:Status,Output:Output}' \
  --output json

echo
echo "Done. If needed, rollback by restoring the printed backup on the instance and restarting vpn-portal-phase1."
