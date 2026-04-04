output "vpn_server_public_ip" {
  description = "Public IP of the active OpenVPN server"
  value       = aws_instance.openvpn_server.public_ip
}

output "iam_role_arn" {
  description = "ARN of the admin IAM role attached to the VPN instance"
  value       = aws_iam_role.openvpn_admin_role.arn
}

output "openvpn_connect_hint" {
  description = "Quick OpenVPN endpoint hint"
  value       = "OpenVPN endpoint: ${aws_instance.openvpn_server.public_ip}:443 (udp primary, tcp fallback)"
}

output "openvpn_udp_endpoint" {
  description = "OpenVPN UDP endpoint"
  value       = "${aws_instance.openvpn_server.public_ip}:443/udp"
}

output "openvpn_tcp_endpoint" {
  description = "OpenVPN TCP endpoint"
  value       = "${aws_instance.openvpn_server.public_ip}:443/tcp"
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