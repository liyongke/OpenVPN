---
name: openvpn-aws-cost-ops
description: >-
  Use when the user asks for AWS cost analysis, monthly bill breakdown, usage
  attribution, cost-saving plan, budget/anomaly guardrails, EC2 runtime
  scheduling, public IP/EIP cost checks, or "how to reduce AWS costs" for this
  OpenVPN repository. Trigger on: "cost analysis", "AWS bill", "cost saving",
  "optimize cost", "budget alert", "anomaly detection", "EIP", "public IPv4",
  "schedule EC2", "reduce monthly cost".
---

# OpenVPN AWS Cost Ops Skill

## Purpose

Run a safe, repeatable AWS cost workflow for this OpenVPN stack:
1. Attribute costs by service and usage type.
2. Build a ranked savings plan with expected impact.
3. Apply only approved non-disruptive actions first.
4. Require explicit confirmation before disruptive/destructive actions.

## Safety and Guardrails

- Prefer read-only checks before any change.
- Keep internet-facing OpenVPN endpoint continuity unless explicitly approved.
- Treat EC2 replacement as disruptive and require maintenance-window confirmation.
- Never delete resources without dry-run evidence and user confirmation.
- Include rollback for every production-impacting action.

## Standard Workflow

### 1) Cost Attribution

- Break down by Service, Usage Type, and linked resource where possible.
- Quantify top contributors with percentage and estimated monthly impact.
- Highlight EC2-Instances, VPC/PublicIPv4, EC2-Other/EBS as common OpenVPN drivers.

### 2) Root-Cause Explanation

Explain why each top charge exists:
- Runtime hours
- Public IPv4 in-use charges
- EBS volume/snapshot retention
- Data transfer patterns

### 3) Ranked Savings Plan

For each action include:
- Expected savings (range)
- Risk level
- Service impact
- Rollback

Classify actions:
- A) Non-disruptive now
- B) Requires maintenance window
- C) Needs architecture change

### 4) Confirmation Gates (Mandatory)

Before disruptive or destructive steps, stop and ask for explicit approval with:
- Exact impact statement
- Outage/endpoint risk
- Rollback path

Do not proceed on implicit approval.

### 5) Apply and Verify

After approved actions, verify:
- Instance/service health
- OpenVPN endpoint reachability
- Scheduler rule state and timezone
- Budget/anomaly resources created and alert targets set
- Report changed vs intentionally unchanged items

## OpenVPN-Specific Notes

- If changing `associate_public_ip_address`, call out possible EC2 replacement risk.
- Keep exactly one `status` directive per OpenVPN server config.
- Keep TCP status file `/var/log/openvpn/status-tcp.log`.
- Keep UDP status file `/var/log/openvpn/status-udp.log`.

## Invocation Pattern

Use this skill directly when requests mention AWS bill analysis, usage attribution,
cost reduction, budget alerts, anomaly detection, EIP/public IPv4 costs, or EC2 scheduling.

## Expected Output

- Findings (highest cost first)
- Recommended actions (with savings and risk)
- Approval-required actions
- Executed actions
- Verification results
- Residual risks and next review date
