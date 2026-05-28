#!/usr/bin/env bash

set -euo pipefail

MODE="dry-run"
REGION="${AWS_REGION:-ap-southeast-1}"
SNAPSHOT_DAYS=30

usage() {
	cat <<'USAGE'
Usage:
	scripts/aws_cost_cleanup_audit.sh [--apply] [--region <aws-region>] [--snapshot-days <n>]

Behavior:
	- Default mode is dry-run (no deletes/releases).
	- --apply will release unassociated Elastic IPs, delete unattached EBS volumes, and delete self-owned snapshots older than N days.

Examples:
	scripts/aws_cost_cleanup_audit.sh
	scripts/aws_cost_cleanup_audit.sh --apply --region ap-southeast-1 --snapshot-days 45
USAGE
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--apply)
			MODE="apply"
			shift
			;;
		--region)
			REGION="$2"
			shift 2
			;;
		--snapshot-days)
			SNAPSHOT_DAYS="$2"
			shift 2
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			echo "Unknown argument: $1" >&2
			usage
			exit 1
			;;
	esac
done

if ! command -v aws >/dev/null 2>&1; then
	echo "aws CLI is required but not found in PATH." >&2
	exit 1
fi

echo "Mode: $MODE"
echo "Region: $REGION"
echo "Snapshot cutoff days: $SNAPSHOT_DAYS"
echo

echo "== Unassociated Elastic IPs =="
EIP_ALLOC_IDS=$(aws ec2 describe-addresses \
	--region "$REGION" \
	--query 'Addresses[?AssociationId==null].AllocationId' \
	--output text || true)

if [[ -z "$EIP_ALLOC_IDS" || "$EIP_ALLOC_IDS" == "None" ]]; then
	echo "No unassociated Elastic IPs found."
else
	for alloc_id in $EIP_ALLOC_IDS; do
		echo "Found unassociated EIP allocation: $alloc_id"
		if [[ "$MODE" == "apply" ]]; then
			aws ec2 release-address --region "$REGION" --allocation-id "$alloc_id"
			echo "Released: $alloc_id"
		fi
	done
fi
echo

echo "== Unattached EBS Volumes =="
VOLUME_IDS=$(aws ec2 describe-volumes \
	--region "$REGION" \
	--filters Name=status,Values=available \
	--query 'Volumes[].VolumeId' \
	--output text || true)

if [[ -z "$VOLUME_IDS" || "$VOLUME_IDS" == "None" ]]; then
	echo "No unattached volumes found."
else
	for volume_id in $VOLUME_IDS; do
		echo "Found unattached volume: $volume_id"
		if [[ "$MODE" == "apply" ]]; then
			aws ec2 delete-volume --region "$REGION" --volume-id "$volume_id"
			echo "Deleted volume: $volume_id"
		fi
	done
fi
echo

echo "== Self-owned old snapshots =="
CUTOFF_TS=$(date -u -v-"${SNAPSHOT_DAYS}"d +"%Y-%m-%dT%H:%M:%SZ")
SNAPSHOT_IDS=$(aws ec2 describe-snapshots \
	--region "$REGION" \
	--owner-ids self \
	--query "Snapshots[?StartTime<='${CUTOFF_TS}'].SnapshotId" \
	--output text || true)

if [[ -z "$SNAPSHOT_IDS" || "$SNAPSHOT_IDS" == "None" ]]; then
	echo "No snapshots older than cutoff found."
else
	for snapshot_id in $SNAPSHOT_IDS; do
		echo "Found old snapshot: $snapshot_id"
		if [[ "$MODE" == "apply" ]]; then
			aws ec2 delete-snapshot --region "$REGION" --snapshot-id "$snapshot_id"
			echo "Deleted snapshot: $snapshot_id"
		fi
	done
fi

echo
if [[ "$MODE" == "dry-run" ]]; then
	echo "Dry-run complete. Re-run with --apply to execute cleanup."
else
	echo "Cleanup apply complete."
fi
