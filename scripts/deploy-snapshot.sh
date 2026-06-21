#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"

AWS_PROFILE="${AWS_PROFILE:-prod}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
DDB_TABLE="${DDB_TABLE:-WineTracker}"

echo "Using AWS_PROFILE=$AWS_PROFILE AWS_REGION=$AWS_REGION DDB_TABLE=$DDB_TABLE"

WEBSITE_BUCKET="$(terraform -chdir="$INFRA_DIR" output -raw website_bucket_name)"
CLOUDFRONT_DISTRIBUTION_ID="$(terraform -chdir="$INFRA_DIR" output -raw cloudfront_distribution_id)"

echo "Exporting DynamoDB snapshot..."
AWS_PROFILE="$AWS_PROFILE" AWS_REGION="$AWS_REGION" DDB_TABLE="$DDB_TABLE" npm --prefix "$ROOT_DIR" run export:data

echo "Building frontend..."
npm --prefix "$ROOT_DIR" run build

echo "Syncing dist/ to s3://$WEBSITE_BUCKET ..."
AWS_PROFILE="$AWS_PROFILE" aws --no-cli-pager s3 sync "$ROOT_DIR/dist/" "s3://$WEBSITE_BUCKET" --delete

echo "Creating CloudFront invalidation..."
INVALIDATION_ID="$(AWS_PROFILE="$AWS_PROFILE" aws --no-cli-pager cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths '/*' --query 'Invalidation.Id' --output text)"

echo "Done. Invalidation ID: $INVALIDATION_ID"
