variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "ap-southeast-1"
}

variable "ami_id" {
  description = "AMI ID for EC2 instance (Amazon Linux 2)"
  type        = string
  default     = "ami-05e0d9d655f80bc27" # Amazon Linux 2 in ap-southeast-1
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro" # Free tier eligible
}

variable "associate_public_ip_address" {
  description = "Whether to associate a public IPv4 address to the OpenVPN EC2 instance"
  type        = bool
  default     = false
}

variable "enable_instance_schedule" {
  description = "Enable daily EC2 start/stop scheduling for the OpenVPN server"
  type        = bool
  default     = false
}

variable "instance_schedule_timezone" {
  description = "IANA timezone used by EventBridge Scheduler for EC2 start/stop"
  type        = string
  default     = "Asia/Kuala_Lumpur"
}

variable "instance_start_hour_local" {
  description = "Local hour (0-23) to start EC2 instance daily"
  type        = number
  default     = 10
}

variable "instance_stop_hour_local" {
  description = "Local hour (0-23) to stop EC2 instance daily"
  type        = number
  default     = 0
}

variable "enable_vpc_flow_logs" {
  description = "Enable VPC Flow Logs for the OpenVPN VPC"
  type        = bool
  default     = true
}

variable "vpc_flow_logs_retention_days" {
  description = "CloudWatch log retention for VPC Flow Logs"
  type        = number
  default     = 14
}

variable "enable_monthly_budget_alert" {
  description = "Enable AWS Budget monthly cost alerts"
  type        = bool
  default     = false
}

variable "monthly_budget_limit_usd" {
  description = "Monthly budget limit in USD"
  type        = number
  default     = 10
}

variable "budget_alert_threshold_percent" {
  description = "Forecast threshold (%) for budget alert emails"
  type        = number
  default     = 80
}

variable "budget_alert_email" {
  description = "Email address to receive budget alerts (required when enable_monthly_budget_alert=true)"
  type        = string
  default     = ""
}

variable "budget_alert_additional_threshold_percent" {
  description = "Additional ACTUAL alert thresholds (%) for monthly budget notifications"
  type        = list(number)
  default     = [120]
}

variable "enable_cost_anomaly_detection" {
  description = "Enable AWS Cost Anomaly Detection email alerts"
  type        = bool
  default     = true
}

variable "cost_anomaly_alert_email" {
  description = "Email address to receive cost anomaly alerts (required when enable_cost_anomaly_detection=true)"
  type        = string
  default     = ""
}

variable "cost_anomaly_threshold_usd" {
  description = "Minimum absolute anomaly impact (USD) to trigger alert emails"
  type        = number
  default     = 3
}

variable "enable_portal_ingress" {
  description = "Enable managed security group ingress for the read-only admin portal"
  type        = bool
  default     = false
}

variable "portal_ingress_port" {
  description = "Public TCP port exposed for admin portal access"
  type        = number
  default     = 9443
}

variable "portal_admin_cidrs" {
  description = "Allowed admin source CIDRs for portal access when enable_portal_ingress=true"
  type        = list(string)
  default     = []
}

variable "github_actions_oidc_role_name" {
  description = "IAM role name assumed by GitHub Actions via OIDC"
  type        = string
  default     = "GitHubActionsOpenVPNDeployRole"
}

variable "github_actions_oidc_dev_role_name" {
  description = "IAM role name assumed by GitHub Actions via OIDC for non-main test branches"
  type        = string
  default     = "GitHubActionsOpenVPNDevRole"
}

variable "github_repository_owner" {
  description = "GitHub repository owner allowed to assume the OIDC role"
  type        = string
  default     = "liyongke"
}

variable "github_repository_name" {
  description = "GitHub repository name allowed to assume the OIDC role"
  type        = string
  default     = "OpenVPN"
}

variable "github_oidc_branch" {
  description = "Git branch allowed to assume the OIDC role"
  type        = string
  default     = "main"
}

variable "github_oidc_dev_branch_pattern" {
  description = "Git branch wildcard pattern allowed to assume the dev OIDC role"
  type        = string
  default     = "dev/*"
}

variable "enable_portal_auth_secret" {
  description = "Create AWS Secrets Manager secret for portal control auth credentials"
  type        = bool
  default     = false
}

variable "portal_auth_secret_name" {
  description = "Secrets Manager secret name used by portal runtime for control auth"
  type        = string
  default     = "openvpn/portal/control-auth"
}

variable "portal_auth_secret_recovery_window_days" {
  description = "Recovery window when deleting portal auth secret"
  type        = number
  default     = 7
}