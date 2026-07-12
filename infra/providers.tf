provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# CloudFront's ACM certificate must live in us-east-1, so a dedicated aliased
# provider is used to look it up regardless of the primary region.
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile
}
