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
