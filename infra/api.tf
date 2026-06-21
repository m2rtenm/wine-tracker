data "archive_file" "wines_api_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/wines_api"
  output_path = "${path.module}/lambda/wines_api.zip"
}

resource "aws_iam_role" "wines_api_lambda_role" {
  name = "wine-tracker-wines-api-lambda-role"

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

resource "aws_iam_role_policy" "wines_api_lambda_policy" {
  name = "wine-tracker-wines-api-lambda-policy"
  role = aws_iam_role.wines_api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Scan",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem"
        ]
        Resource = aws_dynamodb_table.wine_tracker.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.media.arn}/uploads/*"
      },
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

resource "aws_lambda_function" "wines_api" {
  function_name = "wine-tracker-wines-api"
  role          = aws_iam_role.wines_api_lambda_role.arn
  runtime       = "python3.12"
  handler       = "lambda_function.handler"
  timeout       = 30

  filename         = data.archive_file.wines_api_zip.output_path
  source_code_hash = data.archive_file.wines_api_zip.output_base64sha256

  environment {
    variables = {
      TABLE_NAME       = aws_dynamodb_table.wine_tracker.name
      MEDIA_BUCKET     = aws_s3_bucket.media.id
      MEDIA_CDN_DOMAIN = aws_cloudfront_distribution.website_cdn.domain_name
    }
  }
}

resource "aws_apigatewayv2_api" "wines_api" {
  name          = "wine-tracker-wines-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["content-type"]
  }
}

resource "aws_apigatewayv2_integration" "wines_api" {
  api_id                 = aws_apigatewayv2_api.wines_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.wines_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "wines_api_get" {
  api_id    = aws_apigatewayv2_api.wines_api.id
  route_key = "GET /api/wines"
  target    = "integrations/${aws_apigatewayv2_integration.wines_api.id}"
}

resource "aws_apigatewayv2_route" "wines_api_post" {
  api_id    = aws_apigatewayv2_api.wines_api.id
  route_key = "POST /api/wines"
  target    = "integrations/${aws_apigatewayv2_integration.wines_api.id}"
}

resource "aws_apigatewayv2_route" "wines_api_put" {
  api_id    = aws_apigatewayv2_api.wines_api.id
  route_key = "PUT /api/wines/{wineId}"
  target    = "integrations/${aws_apigatewayv2_integration.wines_api.id}"
}

resource "aws_apigatewayv2_route" "wines_api_delete" {
  api_id    = aws_apigatewayv2_api.wines_api.id
  route_key = "DELETE /api/wines/{wineId}"
  target    = "integrations/${aws_apigatewayv2_integration.wines_api.id}"
}

resource "aws_apigatewayv2_stage" "wines_api" {
  api_id      = aws_apigatewayv2_api.wines_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "allow_apigw_invoke" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.wines_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.wines_api.execution_arn}/*/*"
}
