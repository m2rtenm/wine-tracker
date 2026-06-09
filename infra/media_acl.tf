resource "aws_s3_bucket_acl" "media_acl" {
  bucket = aws_s3_bucket.media.id
  acl    = "private"
}
