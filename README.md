# Wine Tracker

A React + Vite wine tasting dashboard with AWS-backed infrastructure definitions.

This repository contains:
- a client-side React application in `src/`
- sample wine data in `src/mockWines.json`
- AWS infrastructure provisioning via Terraform in `infra/`

## Project overview

The app is currently built as a static Vite + React project with Tailwind CSS.

Key components:
- `src/App.jsx` — main page state, wine list management, and form modal control.
- `src/components/AddWineForm.jsx` — add/edit wine form with direct S3 upload and DynamoDB write logic.
- `src/components/WineTable.jsx` — searchable, sortable wine table with member filtering and image preview modal.
- `src/components/DashboardMetrics.jsx` — summary cards for total wines, Sauvignon Blanc count, and top country.

## Features

- Browse wine tasting entries in a responsive dashboard.
- Search and sort wine records.
- Filter by group member.
- Add and edit wine entries.
- View bottle images in a modal.
- Display tasting metrics.
- Soft-delete entries and restore them later.

## Soft Delete And Restore

The application uses soft-delete semantics:

- Deleting a wine marks the DynamoDB item with `isDeleted = true` and `deletedAt` timestamp.
- Soft-deleted items are hidden from the default app list and `GET /api/wines`.
- Media files remain in S3 and are not removed on soft-delete.

### Restore from UI

1. Open the app and go to **Wine Records**.
2. Click **Restore Deleted**.
3. Enter the `wineId` and confirm.
4. The restored entry is returned to the visible list.

### Find wineId for a deleted entry

You can query all entries including deleted ones with:

```bash
curl "https://<api-id>.execute-api.<region>.amazonaws.com/api/wines?includeDeleted=true"
```

Then copy the `wineId` of the entry you want to restore.

### Restore via API directly

```bash
curl -X POST "https://<api-id>.execute-api.<region>.amazonaws.com/api/wines/<wineId>/restore"
```

The response contains the restored item with `isDeleted = false` and `deletedAt = ""`.

## Tech stack

- React 19
- Vite 8
- Tailwind CSS via `@tailwindcss/vite`
- `@tanstack/react-table`
- AWS SDK v3 for S3 and DynamoDB
- Terraform for AWS resources
- ESLint for code quality

## Local development

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Build the production bundle:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Lint the repository:

```bash
npm run lint
```

## Repository structure

- `src/` — React app source code
- `src/mockWines.json` — seeded wine data used on startup
- `src/App.jsx` — main application layout and state management
- `src/components/` — UI components
- `src/main.jsx` — React entry point
- `src/index.css`, `src/App.css` — styling and Tailwind base styles
- `infra/` — Terraform resources for AWS
- `README.md` — this documentation

## AWS infrastructure

Terraform in `infra/` provisions the following:

- `aws_dynamodb_table.wine_tracker` named `WineTracker` with hash key `wineId`
- `aws_s3_bucket.media` named `wine-tracker-media` for media uploads
- `aws_s3_bucket.website` for the static website host
- `aws_cloudfront_distribution.website_cdn` for website delivery
- bucket ACLs and CORS settings for media uploads
- `aws_cognito_user_pool.wine` with Google federation and Hosted UI for authentication
- `aws_apigatewayv2_authorizer.cognito_jwt` gating every API route with a Cognito JWT
- `aws_lambda_function.pre_signup` enforcing an email allowlist at sign-up

### Terraform backend

Remote state is configured in `infra/backend.tf`:
- bucket: `marten-tfstate`
- key: `wine/terraform.tfstate`
- region: `eu-north-1`
- profile: `sec`

### Provider configuration

`infra/providers.tf` sets:
- AWS region from `var.aws_region`
- AWS profile from `var.aws_profile`

Variable defaults live in `infra/variables.tf` (no tfvars file is required):
- `aws_region = "eu-north-1"`
- `aws_profile = "prod"`

## Current implementation notes

- The app currently sources wine entries from `src/mockWines.json`.
- Add/edit/delete state is managed in-memory in `src/App.jsx`.
- `src/components/AddWineForm.jsx` includes direct browser-side use of `S3Client`, `PutObjectCommand`, `DynamoDBClient`, and `PutItemCommand`.
- The application is not yet wired to read wine entries from DynamoDB on initial load.

## Important caveats

- Direct AWS SDK use in the browser is not secure for production.
- The current code uses static bucket and table names and would need a backend or signed upload flow for safe deployment.
- Terraform backend and provider profiles differ (`sec` vs `dev`), so AWS profiles must be configured accordingly.

## Authentication (Cognito + Google)

The app is fully gated behind Google sign-in, brokered by an AWS Cognito User
Pool. The SPA runs the Authorization Code + PKCE flow via the Cognito Hosted UI
(which redirects straight to Google), and the API Gateway validates the
resulting JWT on every route. Access is restricted to an explicit email
allowlist enforced by a Pre-Sign-Up Lambda — any Google account not on the list
is rejected at sign-up.

### One-time setup

Because Cognito federation and the Google OAuth client reference each other,
create them in this order:

1. **Choose the Hosted UI domain prefix.** Default is `wine-tracker-auth`
   (`var.cognito_domain_prefix`), giving
   `https://wine-tracker-auth.auth.eu-north-1.amazoncognito.com`. Override
   `var.cognito_domain_prefix` (edit its default or pass `-var`) if the prefix
   is already taken in the region.

2. **Create a Google OAuth 2.0 client** in the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   *Create Credentials* → *OAuth client ID* → *Web application*:
   - **Authorized JavaScript origins:** the Hosted UI origin, e.g.
     `https://wine-tracker-auth.auth.eu-north-1.amazoncognito.com`
   - **Authorized redirect URI:**
     `https://wine-tracker-auth.auth.eu-north-1.amazoncognito.com/oauth2/idpresponse`
     (this is also emitted as the `cognito_google_redirect_uri` Terraform output)
   - Copy the generated **Client ID** and **Client secret**.

3. **Store the secrets in SSM Parameter Store** (once per account, in
   `eu-north-1` — the same region/account the resources deploy to). These are
   read at apply time by the data sources in `infra/cognito.tf`, so no secrets
   ever land in a tfvars file or on any dev machine — any device with AWS
   creds can apply. Standard-tier `SecureString` with the default `aws/ssm` KMS
   key is $0:
   ```bash
   aws ssm put-parameter --region eu-north-1 --type SecureString \
     --name /wine-tracker/google_client_id     --value "xxxx.apps.googleusercontent.com"
   aws ssm put-parameter --region eu-north-1 --type SecureString \
     --name /wine-tracker/google_client_secret --value "GOCSPX-xxxx"
   aws ssm put-parameter --region eu-north-1 --type SecureString \
     --name /wine-tracker/allowed_emails       --value '["member1@gmail.com","member2@gmail.com"]'
   ```
   `allowed_emails` must be a JSON array string. Whoever runs `terraform apply`
   needs `ssm:GetParameter` on `/wine-tracker/*` and `kms:Decrypt` on the
   `aws/ssm` key (the default admin/prod role already has this).

4. **Apply Terraform** (`terraform apply` from `infra/`). Note the outputs
   `cognito_authority`, `cognito_user_pool_client_id`, and
   `cognito_hosted_ui_domain`.

5. **Deploy the frontend.** CI (`.github/workflows/deploy.yml`) and
   `scripts/deploy-snapshot.sh` read those outputs automatically and pass them
   to the Vite build as `VITE_COGNITO_*`. No new GitHub secrets are needed — the
   Cognito IDs are public; the Google client secret lives only in SSM and
   Terraform state.

### Managing access

Update the `/wine-tracker/allowed_emails` SSM parameter (a JSON array) and re-run
`terraform apply` — the Pre-Sign-Up Lambda's allowlist refreshes from it:
```bash
aws ssm put-parameter --region eu-north-1 --type SecureString --overwrite \
  --name /wine-tracker/allowed_emails --value '["member1@gmail.com","member3@gmail.com"]'
```
Removing an email blocks future sign-ups; to revoke an already-registered user,
also delete them from the User Pool (console or `aws cognito-idp
admin-delete-user`).

### Local development

For `npm run dev`, copy `.env.example` to `.env.local` and fill in the three
`VITE_COGNITO_*` values from the Terraform outputs. `http://localhost:5173/` is
pre-registered as an allowed callback URL (`var.auth_extra_callback_urls`).

## Infra deployment

From the `infra/` directory:

```bash
cd infra
terraform init
terraform plan
terraform apply
```

Override defaults with:

```bash
terraform apply -var='aws_region=eu-north-1' -var='aws_profile=prod'
```

### Custom domain for CloudFront (mandla.tech)

CloudFront supports custom domains, but requires an ACM certificate in `us-east-1`.

1. Request an ACM certificate in `us-east-1` for:
- `mandla.tech`
- `www.mandla.tech`
- `wine.mandla.tech`

2. Validate the certificate using DNS records in Zone.ee.

3. Set the aliases via `var.cloudfront_aliases` (default `["wine.mandla.tech"]`
   in `infra/variables.tf`; edit the default or pass `-var` for more):

```hcl
cloudfront_aliases = ["mandla.tech", "www.mandla.tech", "wine.mandla.tech"]
```

The certificate ARN is no longer configured — it's discovered automatically
from ACM in `us-east-1` by domain (`data.aws_acm_certificate.cloudfront` in
`website.tf`, currently matching `*.mandla.tech`). If you use a different base
domain, update that `domain` filter to match your certificate.

4. Apply infrastructure:

```bash
cd infra
terraform apply
```

5. Read CloudFront DNS target:

```bash
terraform output -raw cloudfront_distribution_domain
```

6. In Zone.ee DNS, point your domain to the CloudFront distribution:
- Preferred for apex domain (`mandla.tech`): `ALIAS`/`ANAME` at `@` -> CloudFront domain from output above
- If Zone.ee plan does not support apex `ALIAS`/`ANAME`, use `www` as `CNAME` to the CloudFront domain and set `mandla.tech` URL redirect to `https://www.mandla.tech`
- Add `CNAME` record for `www` -> same CloudFront domain (recommended even when apex ALIAS is supported)
- Add `CNAME` record for `wine` -> same CloudFront domain

After DNS propagation, `mandla.tech`, `www.mandla.tech`, and `wine.mandla.tech` should resolve to CloudFront.

## GitHub Actions deployment

This repository includes a GitHub Actions workflow at `.github/workflows/deploy.yml`.

Important: the Terraform remote state bucket lives in the `sec` profile/account, while the production website deployment goes through the `prod` profile/account. The workflow is split to use separate credentials for these two purposes.

The workflow uses GitHub OIDC + role assumption (not long-lived access keys).

To use it, add these repository secrets in GitHub:

- `AWS_STATE_ROLE_ARN` — IAM role ARN in the `sec` account (Terraform backend/state access)
- `AWS_DEPLOY_ROLE_ARN` — IAM role ARN in the `prod` account (DynamoDB export + S3 deploy + CloudFront invalidation)

Each AWS account that hosts one of these roles must have an IAM OpenID Connect provider configured for GitHub Actions:

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

Both roles must trust GitHub OIDC and allow `sts:AssumeRoleWithWebIdentity` with repo conditions. Example trust policy:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Principal": {
				"Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
			},
			"Action": "sts:AssumeRoleWithWebIdentity",
			"Condition": {
				"StringEquals": {
					"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
				},
				"StringLike": {
					"token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:ref:refs/heads/main"
				}
			}
		}
	]
}
```

For this project, ensure `<OWNER>/<REPO>` exactly matches your GitHub repository slug (for example `m2rtenm/wine-tracker`). If this claim does not match exactly, role assumption fails even when OIDC is otherwise configured correctly.

The workflow reads the target website bucket and CloudFront distribution ID directly from Terraform outputs in `infra/`.

Terraform behavior in CI/CD:

- The pipeline runs `terraform init` so it can read Terraform outputs (`website_bucket_name`, `cloudfront_distribution_id`, `dynamodb_table_name`) before deployment.
- Infrastructure changes are not applied automatically in CI.
- The workflow ends with a reminder to run Terraform manually for infra changes.

The workflow runs on every push to `main` and performs:

1. `npm ci`
2. `npm run build`
3. `terraform init` in `infra/`
4. `terraform output` to discover `website_bucket_name` and `cloudfront_distribution_id`
5. `aws s3 sync dist/ s3://$WEBSITE_BUCKET --delete`
6. CloudFront invalidation for `/*`
7. Reminder log message to manually run `terraform plan` and `terraform apply` when infra changes are needed

You can also trigger it manually from GitHub via `workflow_dispatch`.

### Manual infrastructure changes

Infrastructure code changes (files in `infra/`) are deployed manually:

1. Make your Terraform changes in `infra/`.
2. Test and apply locally:
```bash
cd infra
terraform plan
terraform apply
```
3. Push changes to main once applied.

## License

This repo does not include an explicit license.
