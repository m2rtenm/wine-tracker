# CloudFront viewer certificate, discovered from ACM (us-east-1) by domain
# instead of hardcoding the ARN. Only looked up when custom aliases are set.
data "aws_acm_certificate" "cloudfront" {
  count       = length(var.cloudfront_aliases) > 0 ? 1 : 0
  provider    = aws.us_east_1
  domain      = "*.mandla.tech"
  statuses    = ["ISSUED"]
  most_recent = true
}

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

# Security response headers applied to the app (HTML/JS/CSS) delivered by
# CloudFront. connect-src must allow the Cognito endpoints the SPA talks to:
# the JWKS/discovery host (cognito-idp) and the Hosted UI domain (token
# exchange). img-src uses `https:` rather than naming the distribution's own
# domain, because referencing it here would create a dependency cycle (the
# distribution references this policy).
locals {
  cognito_hosted_ui_origin = "https://${aws_cognito_user_pool_domain.wine.domain}.auth.${var.aws_region}.amazoncognito.com"
  cognito_idp_origin       = "https://cognito-idp.${var.aws_region}.amazonaws.com"

  content_security_policy = join("; ", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' ${local.cognito_idp_origin} ${local.cognito_hosted_ui_origin}",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ])
}

resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "wine-tracker-security-headers"

  security_headers_config {
    content_security_policy {
      content_security_policy = local.content_security_policy
      override                = true
    }

    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "geolocation=(), camera=(), microphone=(), interest-cohort=()"
      override = true
    }
  }
}

resource "aws_cloudfront_origin_access_control" "oac" {
  name        = "wine-tracker-oac"
  description = "Origin Access Control for WineTracker S3 website"

  origin_access_control_origin_type = "s3"
  signing_protocol                  = "sigv4"
  signing_behavior                  = "always"
}

resource "aws_cloudfront_distribution" "website_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "WineTracker static website CDN"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = var.cloudfront_aliases

  origin {
    domain_name              = aws_s3_bucket.website.bucket_regional_domain_name
    origin_id                = "WineTrackerWebsiteOrigin"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "WineTrackerMediaOrigin"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  origin {
    domain_name = replace(aws_apigatewayv2_api.wines_api.api_endpoint, "https://", "")
    origin_id   = "WineTrackerApiOrigin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  ordered_cache_behavior {
    path_pattern           = "uploads/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "WineTrackerMediaOrigin"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  ordered_cache_behavior {
    path_pattern           = "api/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "WineTrackerApiOrigin"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      headers      = ["Content-Type", "Origin", "Accept", "Authorization"]
      cookies {
        forward = "none"
      }
    }
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "WineTrackerWebsiteOrigin"
    viewer_protocol_policy     = "redirect-to-https"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = length(var.cloudfront_aliases) == 0 ? true : false
    acm_certificate_arn            = length(var.cloudfront_aliases) > 0 ? data.aws_acm_certificate.cloudfront[0].arn : null
    ssl_support_method             = length(var.cloudfront_aliases) > 0 ? "sni-only" : null
    minimum_protocol_version       = length(var.cloudfront_aliases) > 0 ? "TLSv1.2_2021" : null
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

resource "aws_s3_bucket_policy" "website_policy" {
  bucket = aws_s3_bucket.website.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowCloudFrontOACGetObject",
        Effect = "Allow",
        Principal = {
          Service = "cloudfront.amazonaws.com"
        },
        Action   = "s3:GetObject",
        Resource = "${aws_s3_bucket.website.arn}/*",
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.website_cdn.arn
          }
        }
      }
    ]
  })
}
