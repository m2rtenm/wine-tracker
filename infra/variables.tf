variable "aws_region" {
  type    = string
  default = "eu-north-1"
}

variable "aws_profile" {
  type    = string
  default = "prod"
}

variable "cloudfront_aliases" {
  description = "Optional custom domain aliases for CloudFront (for example: [\"mandla.tech\", \"www.mandla.tech\"])."
  type        = list(string)
  default     = []
}

variable "cloudfront_acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for CloudFront aliases. Required when cloudfront_aliases is non-empty. Must match pattern: arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/UUID"
  type        = string
  default     = ""
}

variable "cognito_domain_prefix" {
  description = "Prefix for the Cognito Hosted UI domain (results in https://<prefix>.auth.<region>.amazoncognito.com). Must be globally unique within the region."
  type        = string
  default     = "wine-tracker-auth"
}

variable "google_client_id" {
  description = "Google OAuth 2.0 Web client ID used for Cognito federation. Create it in Google Cloud Console."
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 Web client secret paired with google_client_id. Keep in a gitignored .tfvars file."
  type        = string
  sensitive   = true
}

variable "allowed_emails" {
  description = "Allowlist of Google account emails permitted to sign in. Any other email is rejected at sign-up by the Pre-Sign-Up Lambda trigger. Compared case-insensitively."
  type        = list(string)
  default     = []
}

variable "auth_extra_callback_urls" {
  description = "Additional OAuth callback URLs for the app client (e.g. http://localhost:5173/ for local dev). The CloudFront/custom-domain URLs are added automatically."
  type        = list(string)
  default     = ["http://localhost:5173/"]
}
