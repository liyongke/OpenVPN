terraform {
  backend "s3" {
    bucket = "terraform-state-file-504329778344"
    key    = "openvpn_deployment/terraform.tfstate"
    region = "ap-southeast-1"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

moved {
  from = aws_iam_role.wireguard_admin_role
  to   = aws_iam_role.openvpn_admin_role
}

moved {
  from = aws_iam_instance_profile.wireguard_instance_profile
  to   = aws_iam_instance_profile.openvpn_instance_profile
}

moved {
  from = aws_vpc.wireguard_vpc
  to   = aws_vpc.vpn_vpc
}

moved {
  from = aws_subnet.wireguard_subnet
  to   = aws_subnet.vpn_subnet
}

moved {
  from = aws_internet_gateway.wireguard_igw
  to   = aws_internet_gateway.vpn_igw
}

moved {
  from = aws_route_table.wireguard_rt
  to   = aws_route_table.vpn_rt
}

moved {
  from = aws_route_table_association.wireguard_rta
  to   = aws_route_table_association.vpn_rta
}

moved {
  from = aws_security_group.wireguard_sg
  to   = aws_security_group.vpn_sg
}

moved {
  from = aws_instance.wireguard_server
  to   = aws_instance.openvpn_server
}

moved {
  from = aws_flow_log.wireguard_vpc_flow_logs
  to   = aws_flow_log.vpn_vpc_flow_logs
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_key_pair" "openvpn_key" {
  key_name   = "OpenVPNKey"
  public_key = file("${path.module}/openvpn-key.pub")
}

# CloudWatch log group for VPC Flow Logs
resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  count             = var.enable_vpc_flow_logs ? 1 : 0
  name              = "/aws/vpc/flow-logs/${aws_vpc.vpn_vpc.id}"
  retention_in_days = var.vpc_flow_logs_retention_days

  tags = {
    Name = "OpenVPN-VPC-Flow-Logs"
  }
}

# IAM role used by VPC Flow Logs service to write to CloudWatch Logs
resource "aws_iam_role" "vpc_flow_logs_role" {
  count = var.enable_vpc_flow_logs ? 1 : 0
  name  = "openvpn-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "vpc_flow_logs_policy" {
  count = var.enable_vpc_flow_logs ? 1 : 0
  name  = "openvpn-vpc-flow-logs-policy"
  role  = aws_iam_role.vpc_flow_logs_role[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_flow_log" "vpn_vpc_flow_logs" {
  count                    = var.enable_vpc_flow_logs ? 1 : 0
  log_destination_type     = "cloud-watch-logs"
  log_destination          = aws_cloudwatch_log_group.vpc_flow_logs[0].arn
  iam_role_arn             = aws_iam_role.vpc_flow_logs_role[0].arn
  vpc_id                   = aws_vpc.vpn_vpc.id
  traffic_type             = "ALL"
  max_aggregation_interval = 60

  depends_on = [
    aws_iam_role_policy.vpc_flow_logs_policy
  ]
}

# IAM Role for Admin Access
resource "aws_iam_role" "openvpn_admin_role" {
  name = "OpenVPNAdminRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
      },
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "admin_attach" {
  role       = aws_iam_role.openvpn_admin_role.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "aws_iam_instance_profile" "openvpn_instance_profile" {
  name = "openvpn-instance-profile"
  role = aws_iam_role.openvpn_admin_role.name
}

# VPC
resource "aws_vpc" "vpn_vpc" {
  cidr_block = "10.0.0.0/16"
  tags = {
    Name = "OpenVPN-VPC"
  }
}

# Subnet
resource "aws_subnet" "vpn_subnet" {
  vpc_id            = aws_vpc.vpn_vpc.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.aws_region}a"
  tags = {
    Name = "OpenVPN-Subnet"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "vpn_igw" {
  vpc_id = aws_vpc.vpn_vpc.id
  tags = {
    Name = "OpenVPN-IGW"
  }
}

# Route Table
resource "aws_route_table" "vpn_rt" {
  vpc_id = aws_vpc.vpn_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.vpn_igw.id
  }

  tags = {
    Name = "OpenVPN-RT"
  }
}

resource "aws_route_table_association" "vpn_rta" {
  subnet_id      = aws_subnet.vpn_subnet.id
  route_table_id = aws_route_table.vpn_rt.id
}

# Security Group
resource "aws_security_group" "vpn_sg" {
  vpc_id = aws_vpc.vpn_vpc.id
  name   = "openvpn-sg"

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Restrict to your IP in production
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"] # Restrict to your IP in production
  }

  dynamic "ingress" {
    for_each = var.enable_portal_ingress ? var.portal_admin_cidrs : []

    content {
      description = "Admin portal ingress"
      from_port   = var.portal_ingress_port
      to_port     = var.portal_ingress_port
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "OpenVPN-SG"
  }
}

# EC2 Instance
resource "aws_instance" "openvpn_server" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  key_name                    = aws_key_pair.openvpn_key.key_name
  source_dest_check           = false
  subnet_id                   = aws_subnet.vpn_subnet.id
  vpc_security_group_ids      = [aws_security_group.vpn_sg.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.openvpn_instance_profile.name

  # OpenVPN is managed by openvpn_setup.sh and systemd on the running host.
  # Ignore user_data drift to avoid replacing the live instance.
  user_data                   = null
  user_data_replace_on_change = false

  lifecycle {
    ignore_changes = [
      user_data,
      user_data_replace_on_change,
    ]
  }

  tags = {
    Name = "OpenVPN-Server"
  }
}

# Optional monthly budget alert for quick cost visibility
resource "aws_budgets_budget" "monthly_cost_budget" {
  count = var.enable_monthly_budget_alert && var.budget_alert_email != "" ? 1 : 0

  name         = "openvpn-monthly-budget"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Region"
    values = [data.aws_region.current.name]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.budget_alert_threshold_percent
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
