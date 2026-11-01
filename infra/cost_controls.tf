data "aws_caller_identity" "current" {}

locals {
  wine_tracker_budget_name = "wine-tracker-monthly-cost-limit"
  wine_tracker_budget_arn  = "arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/${local.wine_tracker_budget_name}"
}

data "archive_file" "budget_shutdown_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/budget_shutdown"
  output_path = "${path.module}/lambda/budget_shutdown.zip"
}

resource "aws_cloudwatch_event_rule" "monthly_api_restore" {
  provider            = aws.us_east_1
  name                = "wine-tracker-monthly-api-restore"
  description         = "Restore API Lambda concurrency at the start of each month."
  schedule_expression = "cron(0 0 1 * ? *)"
}

resource "aws_sns_topic" "wine_tracker_budget" {
  provider = aws.us_east_1
  name     = "wine-tracker-budget-alert"
}

resource "aws_sns_topic_policy" "wine_tracker_budget" {
  provider = aws.us_east_1
  arn      = aws_sns_topic.wine_tracker_budget.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowWineTrackerBudgetNotifications"
      Effect    = "Allow"
      Principal = { Service = "budgets.amazonaws.com" }
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.wine_tracker_budget.arn
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
        ArnEquals = {
          "aws:SourceArn" = local.wine_tracker_budget_arn
        }
      }
    }]
  })
}

resource "aws_iam_role" "budget_shutdown" {
  name = "wine-tracker-budget-shutdown-role"

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

resource "aws_iam_role_policy" "budget_shutdown" {
  name = "wine-tracker-budget-shutdown-policy"
  role = aws_iam_role.budget_shutdown.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:PutFunctionConcurrency"]
        Resource = aws_lambda_function.wines_api.arn
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

resource "aws_lambda_function" "budget_shutdown" {
  provider         = aws.us_east_1
  function_name    = "wine-tracker-budget-shutdown"
  role             = aws_iam_role.budget_shutdown.arn
  runtime          = "python3.12"
  handler          = "lambda_function.handler"
  timeout          = 10
  filename         = data.archive_file.budget_shutdown_zip.output_path
  source_code_hash = data.archive_file.budget_shutdown_zip.output_base64sha256

  environment {
    variables = {
      TARGET_FUNCTION_ARN = aws_lambda_function.wines_api.arn
      TARGET_REGION       = var.aws_region
      BUDGET_NAME         = local.wine_tracker_budget_name
      ACCOUNT_ID          = data.aws_caller_identity.current.account_id
      MONTHLY_LIMIT_USD   = tostring(var.monthly_cost_limit_usd)
      RESTORE_CONCURRENCY = tostring(var.wines_api_reserved_concurrency)
    }
  }
}

resource "aws_lambda_permission" "budget_shutdown_from_events" {
  provider      = aws.us_east_1
  statement_id  = "AllowMonthlyConcurrencyRestore"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.budget_shutdown.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.monthly_api_restore.arn
}

resource "aws_cloudwatch_event_target" "monthly_api_restore" {
  provider  = aws.us_east_1
  rule      = aws_cloudwatch_event_rule.monthly_api_restore.name
  target_id = "restore-api-concurrency"
  arn       = aws_lambda_function.budget_shutdown.arn

  depends_on = [aws_lambda_permission.budget_shutdown_from_events]
}

resource "aws_lambda_permission" "budget_shutdown_from_sns" {
  provider      = aws.us_east_1
  statement_id  = "AllowBudgetTopicInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.budget_shutdown.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.wine_tracker_budget.arn
}

resource "aws_sns_topic_subscription" "budget_shutdown_lambda" {
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.wine_tracker_budget.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.budget_shutdown.arn
  depends_on = [
    aws_lambda_permission.budget_shutdown_from_sns,
    aws_sns_topic_policy.wine_tracker_budget,
  ]
}

resource "aws_budgets_budget" "wine_tracker_monthly" {
  provider     = aws.us_east_1
  name         = local.wine_tracker_budget_name
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_cost_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$wine-tracker"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.monthly_cost_limit_usd
    threshold_type             = "ABSOLUTE_VALUE"
    notification_type          = "ACTUAL"
    subscriber_sns_topic_arns  = [aws_sns_topic.wine_tracker_budget.arn]
    subscriber_email_addresses = [var.billing_alert_email]
  }

  depends_on = [aws_sns_topic_policy.wine_tracker_budget]
}
