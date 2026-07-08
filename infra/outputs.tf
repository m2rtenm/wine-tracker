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

output "cloudfront_hosted_zone_id" {
  description = "CloudFront hosted zone ID for Route53 alias records."
  value       = aws_cloudfront_distribution.website_cdn.hosted_zone_id
}

output "cloudfront_aliases" {
  description = "Configured CloudFront custom domain aliases."
  value       = aws_cloudfront_distribution.website_cdn.aliases
}

output "cloudfront_custom_domain_enabled" {
  description = "Whether custom aliases are enabled on the CloudFront distribution."
  value       = length(aws_cloudfront_distribution.website_cdn.aliases) > 0
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

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID."
  value       = aws_cognito_user_pool.wine.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito app client ID used by the SPA (also the JWT audience)."
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_authority" {
  description = "OIDC issuer/authority URL for the Cognito User Pool."
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.wine.id}"
}

output "cognito_hosted_ui_domain" {
  description = "Cognito Hosted UI domain (used for login and logout endpoints)."
  value       = "https://${aws_cognito_user_pool_domain.wine.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "cognito_google_redirect_uri" {
  description = "Authorized redirect URI to register in the Google OAuth client."
  value       = "https://${aws_cognito_user_pool_domain.wine.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/idpresponse"
}
