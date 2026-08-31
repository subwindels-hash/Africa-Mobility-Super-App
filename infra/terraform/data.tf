###############################################################################
# AMSA — data & content infrastructure: RDS PostgreSQL (Multi-AZ + PITR),
# ElastiCache Redis, S3 media bucket (versioned + KMS), backup vault.
###############################################################################
resource "aws_db_subnet_group" "amsa" {
  name       = "amsa-db"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_instance" "amsa" {
  identifier                   = "amsa-postgres"
  engine                       = "postgres"
  engine_version               = "16.4"
  instance_class               = var.db_instance_class
  allocated_storage            = 200
  storage_encrypted            = true
  multi_az                     = true
  backup_retention_period      = 30          # docs/18 §43 — PITR window
  deletion_protection          = true
  db_subnet_group_name         = aws_db_subnet_group.amsa.name
  username                     = "amsa_admin"
  password                     = var.db_password
  skip_final_snapshot          = false
  final_snapshot_identifier    = "amsa-final"
  performance_insights_enabled = true
}

resource "aws_elasticache_replication_group" "amsa" {
  replication_group_id       = "amsa-redis"
  description                = "AMSA sessions, queues, FAMS cache"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  snapshot_retention_limit   = 7
}

resource "aws_s3_bucket" "media" {
  bucket = "amsa-media-${var.environment}"
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms", kms_master_key_id = var.kms_key_id }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "backups" {
  bucket = "amsa-backups-${var.environment}"
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    id     = "dr"
    status = "Enabled"
    transition { days = 90, storage_class = "GLACIER" }
    noncurrent_version_expiration { noncurrent_days = 365 }
  }
}

output "database_endpoint" { value = aws_db_instance.amsa.endpoint }
output "redis_endpoint" { value = aws_elasticache_replication_group.amsa.primary_endpoint_address }
output "media_bucket" { value = aws_s3_bucket.media.bucket }
