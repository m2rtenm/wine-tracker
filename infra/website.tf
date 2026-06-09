resource "random_id" "website_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "website" {
  bucket        = "wine-tracker-website-${random_id.website_suffix.hex}"
  force_destroy = true

  tags = {
    Name        = "WineTrackerWebsite"
    Environment = var.aws_profile
  }
}

resource "aws_s3_bucket_website_configuration" "website" {
  bucket = aws_s3_bucket.website.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "404.html"
  }
}

resource "aws_cloudfront_distribution" "website_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "WineTracker static website CDN"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name = format("%s.s3-website.%s.amazonaws.com", aws_s3_bucket.website.bucket, var.aws_region)
    origin_id   = "WineTrackerWebsiteOrigin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "WineTrackerWebsiteOrigin"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name        = "WineTrackerCDN"
    Environment = var.aws_profile
  }
}
