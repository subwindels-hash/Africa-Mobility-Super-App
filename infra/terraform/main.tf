###############################################################################
# AMSA — AWS infrastructure baseline (docs/16 §38)
# terraform init && terraform plan -var-file=envs/staging.tfvars
###############################################################################
terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
  backend "s3" {
    bucket         = "amsa-tfstate"
    key            = "platform/terraform.tfstate"
    region         = "af-south-1"
    dynamodb_table = "amsa-tflock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "AMSA"
      Environment = var.env
      ManagedBy   = "terraform"
    }
  }
}

variable "region" { default = "af-south-1" }
variable "env" { default = "staging" }
variable "vpc_cidr" { default = "10.40.0.0/16" }
variable "azs" { default = ["af-south-1a", "af-south-1b", "af-south-1c"] }

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.9"

  name = "amsa-${var.env}"
  cidr = var.vpc_cidr
  azs  = var.azs

  public_subnets   = ["10.40.0.0/22", "10.40.4.0/22", "10.40.8.0/22"]
  private_subnets  = ["10.40.32.0/20", "10.40.48.0/20", "10.40.64.0/20"]
  database_subnets = ["10.40.96.0/22", "10.40.100.0/22", "10.40.104.0/22"]

  enable_nat_gateway     = true
  one_nat_gateway_per_az = true
  enable_dns_hostnames   = true
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name    = "amsa-${var.env}"
  cluster_version = "1.30"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  cluster_endpoint_public_access = true

  eks_managed_node_groups = {
    stateless = { # Spot for scale-out services
      instance_types = ["m7g.large", "c7g.large"]
      capacity_type  = "SPOT"
      min_size = 2, max_size = 12, desired_size = 3
      labels = { workload = "stateless" }
    }
    money = { # On-Demand, isolated for payment/escrow/ledger pods
      instance_types = ["m7g.xlarge"]
      capacity_type  = "ON_DEMAND"
      min_size = 2, max_size = 6, desired_size = 2
      labels = { workload = "money" }
    }
  }
}

resource "aws_rds_cluster" "postgres" {
  cluster_identifier              = "amsa-${var.env}-pg"
  engine                          = "aurora-postgresql"
  engine_version                  = "16.4"
  database_name                   = "amsa"
  master_username                 = "amsa_admin"
  manage_master_user_password     = true
  db_subnet_group_name            = module.vpc.database_subnet_group_name
  storage_encrypted               = true
  backup_retention_period         = 35
  preferred_backup_window         = "01:00-02:00"
  enabled_cloudwatch_logs_exports = ["postgresql"]
  serverlessv2_scaling_configuration {
    min_capacity = 2
    max_capacity = 64
  }
}

resource "aws_rds_cluster_instance" "writer" {
  count               = 2 # writer + hot standby (multi-AZ)
  identifier          = "amsa-${var.env}-pg-${count.index}"
  cluster_identifier  = aws_rds_cluster.postgres.id
  instance_class      = "db.serverless"
  performance_insights_enabled = true
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "amsa-${var.env}-redis"
  description                = "AMSA cache/queues/sockets"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.r7g.large"
  num_cache_clusters         = 3
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

resource "aws_msk_cluster" "kafka" {
  cluster_name           = "amsa-${var.env}"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 3
  broker_node_group_info {
    instance_type   = "kafka.m7g.large"
    client_subnets  = module.vpc.private_subnets
    storage_info { ebs_storage_info { volume_size = 200 } }
  }
}

resource "aws_s3_bucket" "media" {
  bucket = "amsa-${var.env}-media"
}
resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket" "audit_archive" {
  bucket = "amsa-${var.env}-audit-worm"
}
resource "aws_s3_bucket_object_lock_configuration" "audit" {
  bucket = aws_s3_bucket.audit_archive.id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = 2555 # 7 years — audit trail (docs/18 §43)
    }
  }
}

output "cluster_endpoint" { value = module.eks.cluster_endpoint }
output "db_writer_endpoint" { value = aws_rds_cluster.postgres.endpoint }
output "redis_endpoint" { value = aws_elasticache_replication_group.redis.primary_endpoint_address }
