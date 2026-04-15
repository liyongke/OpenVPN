#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"

INSTANCE_ID="${INSTANCE_ID:-}"
if [[ -z "$INSTANCE_ID" ]]; then
  INSTANCE_ID="$(aws ec2 describe-instances \
    --filters Name=tag:Name,Values=OpenVPN-Server Name=instance-state-name,Values=running \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)"
fi

if [[ -z "$INSTANCE_ID" || "$INSTANCE_ID" == "None" ]]; then
  echo "Unable to resolve OpenVPN instance id." >&2
  exit 1
fi

read -r -d '' COMMANDS_JSON <<'JSON' || true
{"commands":[
  "set -euo pipefail",
  "PORTAL_USER=portaladmin",
  "PORTAL_PASS=$(openssl rand -base64 24 | tr -d \"=+/\" | cut -c1-24)",
  "if ! command -v htpasswd >/dev/null 2>&1; then yum install -y httpd-tools >/dev/null; fi",
  "htpasswd -bc /etc/nginx/.htpasswd \"$PORTAL_USER\" \"$PORTAL_PASS\" >/dev/null",
  "printf \"%s:%s\\n\" \"$PORTAL_USER\" \"$PORTAL_PASS\" > /home/ec2-user/portal_basic_auth.txt",
  "chown ec2-user:ec2-user /home/ec2-user/portal_basic_auth.txt",
  "chmod 600 /home/ec2-user/portal_basic_auth.txt",
  "systemctl reload nginx",
  "echo ROTATED:$PORTAL_USER:$PORTAL_PASS"
]}
JSON

COMMAND_ID="$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "Rotate portal basic auth" \
  --parameters "$COMMANDS_JSON" \
  --query 'Command.CommandId' --output text)"

STATUS="InProgress"
for _ in $(seq 1 30); do
  STATUS="$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'Status' --output text 2>/dev/null || true)"

  case "$STATUS" in
    Success|Failed|Cancelled|TimedOut)
      break
      ;;
    *)
      sleep 2
      ;;
  esac
done

if [[ "$STATUS" != "Success" ]]; then
  echo "Rotation command did not succeed. Final status: $STATUS" >&2
  aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" --output json >&2 || true
  exit 1
fi

ROTATED_LINE="$(aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --query 'StandardOutputContent' --output text | tr -d '\r' | awk '/^ROTATED:/{print; exit}')"

if [[ -z "$ROTATED_LINE" ]]; then
  echo "Rotation succeeded but credential line was not found in output." >&2
  exit 1
fi

CRED_PAIR="${ROTATED_LINE#ROTATED:}"
USERNAME="${CRED_PAIR%%:*}"
PASSWORD="${CRED_PAIR#*:}"

PORTAL_URL="$(terraform output -raw portal_admin_url 2>/dev/null || true)"
if [[ -z "$PORTAL_URL" ]]; then
  SERVER_IP="$(terraform output -raw vpn_server_public_ip)"
  PORTAL_URL="https://${SERVER_IP}:9443"
fi

cat > "$REPO_DIR/portal_credentials.txt" <<EOF
# Portal login credential (local only)
# URL: ${PORTAL_URL}
# Generated on: $(date +%F)

username: ${USERNAME}
password: ${PASSWORD}
EOF
chmod 600 "$REPO_DIR/portal_credentials.txt"

HTTP_CODE="$(curl -k -sS -o /dev/null -w '%{http_code}' -u "${USERNAME}:${PASSWORD}" "${PORTAL_URL}/healthz" || true)"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Credential rotated, but auth check returned HTTP ${HTTP_CODE}." >&2
  exit 1
fi

echo "Portal credential rotated successfully."
echo "instance_id: ${INSTANCE_ID}"
echo "url: ${PORTAL_URL}"
echo "username: ${USERNAME}"
echo "local_file: portal_credentials.txt"
