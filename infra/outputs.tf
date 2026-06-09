output "dynamodb_table_name" {
  description = "DynamoDB table used to store wine tasting metadata."
  value       = aws_dynamodb_table.wine_tracker.name
}

output "website_bucket_name" {
  description = "S3 bucket name for the static website host."
  value       = aws_s3_bucket.website.bucket
}

output "cloudfront_distribution_domain" {
  description = "CloudFront domain for the static website distribution."
  value       = aws_cloudfront_distribution.website_cdn.domain_name
}

output "media_bucket_name" {
  description = "S3 bucket name for wine bottle media uploads."
  value       = aws_s3_bucket.media.bucket
}
