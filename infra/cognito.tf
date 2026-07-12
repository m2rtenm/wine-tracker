locals {
  # App URLs allowed as OAuth redirect/logout targets. The CloudFront default
  # domain always works; custom aliases (if any) and dev URLs are added too.
  app_base_urls = distinct(concat(
    ["https://${aws_cloudfront_distribution.website_cdn.domain_name}/"],
    [for alias in var.cloudfront_aliases : "https://${alias}/"],
  ))
  auth_redirect_urls = distinct(concat(local.app_base_urls, var.auth_extra_callback_urls))
}

# ---------------------------------------------------------------------------
# Secrets sourced from SSM Parameter Store (Standard tier, SecureString with the
# default aws/ssm KMS key = $0). Create them once per account, out of band:
#   aws ssm put-parameter --region eu-north-1 --type SecureString \
#     --name /wine-tracker/google_client_id     --value "xxxx.apps.googleusercontent.com"
#   aws ssm put-parameter --region eu-north-1 --type SecureString \
#     --name /wine-tracker/google_client_secret --value "GOCSPX-xxxx"
#   aws ssm put-parameter --region eu-north-1 --type SecureString \
#     --name /wine-tracker/allowed_emails       --value '["a@gmail.com","b@gmail.com"]'
# This keeps them out of git and off every dev machine — any device with AWS
# creds reads them at apply time. with_decryption defaults to true.
# ---------------------------------------------------------------------------
data "aws_ssm_parameter" "google_client_id" {
  name = "/wine-tracker/google_client_id"
}

data "aws_ssm_parameter" "google_client_secret" {
  name = "/wine-tracker/google_client_secret"
}

data "aws_ssm_parameter" "allowed_emails" {
  name = "/wine-tracker/allowed_emails"
}

# ---------------------------------------------------------------------------
# Pre-Sign-Up Lambda: enforces the email allowlist for federated sign-ups.
# ---------------------------------------------------------------------------
data "archive_file" "pre_signup_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/pre_signup"
  output_path = "${path.module}/lambda/pre_signup.zip"
}

resource "aws_iam_role" "pre_signup_lambda_role" {
  name = "wine-tracker-pre-signup-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "pre_signup_lambda_policy" {
  name = "wine-tracker-pre-signup-lambda-policy"
  role = aws_iam_role.pre_signup_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_lambda_function" "pre_signup" {
  function_name = "wine-tracker-pre-signup"
  role          = aws_iam_role.pre_signup_lambda_role.arn
  runtime       = "python3.12"
  handler       = "lambda_function.handler"
  timeout       = 10

  filename         = data.archive_file.pre_signup_zip.output_path
  source_code_hash = data.archive_file.pre_signup_zip.output_base64sha256

  environment {
    variables = {
      ALLOWED_EMAILS = join(",", jsondecode(data.aws_ssm_parameter.allowed_emails.value))
    }
  }
}

resource "aws_lambda_permission" "allow_cognito_invoke_pre_signup" {
  statement_id  = "AllowExecutionFromCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.wine.arn
}

# ---------------------------------------------------------------------------
# Cognito User Pool + Google federation + Hosted UI
# ---------------------------------------------------------------------------
resource "aws_cognito_user_pool" "wine" {
  name = "wine-tracker-users"

  # Lite tier: free up to 10,000 monthly active users. New pools otherwise
  # default to Essentials, which is only free for a 6-month trial. Lite covers
  # everything this app uses (classic Hosted UI + Google federation + MFA).
  user_pool_tier = "LITE"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  lambda_config {
    pre_sign_up = aws_lambda_function.pre_signup.arn
  }

  tags = {
    Name        = "WineTrackerUsers"
    Environment = var.aws_profile
  }
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.wine.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = data.aws_ssm_parameter.google_client_id.value
    client_secret    = data.aws_ssm_parameter.google_client_secret.value
    authorize_scopes = "openid email profile"
    # Cognito auto-populates these standard Google endpoints after creation.
    # Declaring them keeps config == state and avoids a perpetual plan diff.
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    picture        = "picture"
    username       = "sub"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "wine-tracker-web"
  user_pool_id = aws_cognito_user_pool.wine.id

  # Public SPA client: no secret, uses Authorization Code + PKCE.
  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  supported_identity_providers = ["Google"]

  callback_urls = local.auth_redirect_urls
  logout_urls   = local.auth_redirect_urls

  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]

  depends_on = [aws_cognito_identity_provider.google]
}

resource "aws_cognito_user_pool_domain" "wine" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.wine.id
}
