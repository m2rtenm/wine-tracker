variable "aws_region" {
  type    = string
  default = "eu-north-1"
}

variable "aws_profile" {
  type    = string
  default = "dev"
}

variable "aws_assume_role_arn" {
  description = "Optional role ARN for the AWS provider to assume (useful in CI where backend and resource accounts differ)."
  type        = string
  default     = ""
}

variable "cloudfront_aliases" {
  description = "Optional custom domain aliases for CloudFront (for example: [\"mandla.tech\", \"www.mandla.tech\"])."
  type        = list(string)
  default     = []
}

variable "cloudfront_acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for CloudFront aliases. Required when cloudfront_aliases is non-empty."
  type        = string
  default     = ""

  validation {
    condition = length(var.cloudfront_aliases) == 0 || (
      length(var.cloudfront_acm_certificate_arn) > 0 &&
      can(regex("^arn:aws:acm:us-east-1:[0-9]{12}:certificate/.+", var.cloudfront_acm_certificate_arn))
    )
    error_message = "When cloudfront_aliases is set, cloudfront_acm_certificate_arn must be a valid us-east-1 ACM certificate ARN."
  }
}
