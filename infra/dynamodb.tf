resource "aws_dynamodb_table" "wine_tracker" {
  name         = "WineTracker"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "wineId"

  attribute {
    name = "wineId"
    type = "S"
  }

  tags = {
    Name        = "WineTracker"
    Environment = var.aws_profile
  }
}
