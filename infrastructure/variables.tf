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