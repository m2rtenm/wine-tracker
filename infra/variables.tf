variable "aws_region" {
  type    = string
  default = "eu-north-1"
}

variable "aws_profile" {
  type    = string
  default = "prod"
}

variable "cloudfront_aliases" {
  description = "Custom domain aliases for CloudFront. Defaults to the live alias so no tfvars file is required; set to [] to serve on the CloudFront default domain."
  type        = list(string)
  default     = ["wine.mandla.tech"]
}

# cloudfront_acm_certificate_arn is no longer a variable — the CloudFront
# viewer certificate is discovered from ACM (us-east-1) by domain via the
# data.aws_acm_certificate.cloudfront lookup in website.tf.

variable "cognito_domain_prefix" {
  description = "Prefix for the Cognito Hosted UI domain (results in https://<prefix>.auth.<region>.amazoncognito.com). Must be globally unique within the region."
  type        = string
  default     = "wine-tracker-auth"
}

# google_client_id, google_client_secret, and allowed_emails are no longer
# Terraform variables — they are read at apply time from SSM Parameter Store
# (see the data sources in cognito.tf), so no secrets live in tfvars or on any
# dev machine.

variable "auth_extra_callback_urls" {
  description = "Additional OAuth callback URLs for the app client (e.g. http://localhost:5173/ for local dev). The CloudFront/custom-domain URLs are added automatically."
  type        = list(string)
  default     = ["http://localhost:5173/"]
}

variable "extra_cors_origins" {
  description = "Additional browser origins allowed to call the API (no trailing slash). Use when serving on the default CloudFront domain (cloudfront_aliases = []) — set this to https://<distribution>.cloudfront.net. The custom aliases and dev callback origins are allowed automatically."
  type        = list(string)
  default     = []
}

variable "max_upload_bytes" {
  description = "Maximum size (in bytes) of an image upload accepted by the API. Note that API Gateway HTTP APIs cap the whole request payload at ~10 MB; base64 encoding inflates the image by ~33%."
  type        = number
  default     = 8388608 # 8 MiB
}
