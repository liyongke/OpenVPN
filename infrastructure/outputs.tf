output "vpn_server_public_ip" {
  description = "Public IP of the active OpenVPN server"
  value       = aws_instance.openvpn_server.public_ip
}

output "iam_role_arn" {
  description = "ARN of the admin IAM role attached to the VPN instance"
  value       = aws_iam_role.openvpn_admin_role.arn
}

output "github_actions_oidc_role_arn" {
  description = "ARN of IAM role assumed by GitHub Actions via OIDC"
  value       = aws_iam_role.github_actions_deploy_role.arn
}

output "github_actions_oidc_dev_role_arn" {
  description = "ARN of IAM role assumed by GitHub Actions via OIDC on dev branches"
  value       = aws_iam_role.github_actions_dev_role.arn
}

output "github_actions_oidc_provider_arn" {
  description = "ARN of GitHub Actions OIDC provider in IAM"
  value       = aws_iam_openid_connect_provider.github_actions.arn
}

output "openvpn_connect_hint" {
  description = "Quick OpenVPN endpoint hint"
  value       = var.associate_public_ip_address ? "OpenVPN endpoint: ${aws_instance.openvpn_server.public_ip}:443 (udp primary, tcp fallback)" : "No public endpoint (associate_public_ip_address=false). Use private networking or attach a public endpoint strategy."
}

output "openvpn_udp_endpoint" {
  description = "OpenVPN UDP endpoint"
  value       = var.associate_public_ip_address ? "${aws_instance.openvpn_server.public_ip}:443/udp" : null
}

output "openvpn_tcp_endpoint" {
  description = "OpenVPN TCP endpoint"
  value       = var.associate_public_ip_address ? "${aws_instance.openvpn_server.public_ip}:443/tcp" : null
}

output "vpc_flow_log_group_name" {
  description = "CloudWatch Log Group name for VPC Flow Logs"
  value       = var.enable_vpc_flow_logs ? aws_cloudwatch_log_group.vpc_flow_logs[0].name : null
}

output "vpc_flow_log_id" {
  description = "VPC Flow Log ID"
  value       = var.enable_vpc_flow_logs ? aws_flow_log.vpn_vpc_flow_logs[0].id : null
}

output "budget_alert_name" {
  description = "Budget alert resource name (if enabled)"
  value       = var.enable_monthly_budget_alert && var.budget_alert_email != "" ? aws_budgets_budget.monthly_cost_budget[0].name : null
}

output "openvpn_start_schedule_name" {
  description = "EventBridge Scheduler rule name for instance daily start"
  value       = var.enable_instance_schedule ? aws_scheduler_schedule.openvpn_start[0].name : null
}

output "openvpn_stop_schedule_name" {
  description = "EventBridge Scheduler rule name for instance daily stop"
  value       = var.enable_instance_schedule ? aws_scheduler_schedule.openvpn_stop[0].name : null
}

output "cost_anomaly_monitor_arn" {
  description = "Cost anomaly monitor ARN (if enabled)"
  value       = var.enable_cost_anomaly_detection && var.cost_anomaly_alert_email != "" ? aws_ce_anomaly_monitor.openvpn_cost_monitor[0].arn : null
}

output "portal_admin_url" {
  description = "Admin portal URL when portal ingress is enabled"
  value       = var.enable_portal_ingress ? "https://${aws_instance.openvpn_server.public_ip}:${var.portal_ingress_port}" : null
}

output "portal_vpn_tcp_url" {
  description = "VPN-only portal URL for TCP clients (tun1 network)"
  value       = "http://10.9.0.1:8088"
}

output "portal_vpn_udp_url" {
  description = "VPN-only portal URL for UDP clients (tun0 network)"
  value       = "http://10.8.0.1:8088"
}

output "portal_control_auth_secret_arn" {
  description = "Secrets Manager ARN for portal control authentication"
  value       = var.enable_portal_auth_secret ? aws_secretsmanager_secret.portal_control_auth[0].arn : null
}

output "portal_control_auth_secret_name" {
  description = "Secrets Manager name for portal control authentication"
  value       = var.enable_portal_auth_secret ? aws_secretsmanager_secret.portal_control_auth[0].name : null
}
