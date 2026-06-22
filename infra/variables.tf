variable "aws_region" {
  type    = string
  default = "eu-north-1"
}

variable "aws_profile" {
  type    = string
  default = "dev"
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
