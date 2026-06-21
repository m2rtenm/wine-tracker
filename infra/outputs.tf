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

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.website_cdn.id
}

output "media_bucket_name" {
  description = "S3 bucket name for wine bottle media uploads."
  value       = aws_s3_bucket.media.bucket
}

output "wines_api_endpoint" {
  description = "HTTP API endpoint for wines CRUD."
  value       = aws_apigatewayv2_api.wines_api.api_endpoint
}

output "wines_api_id" {
  description = "HTTP API ID for wines CRUD."
  value       = aws_apigatewayv2_api.wines_api.id
}
