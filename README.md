# Wine Tracker

A React + Vite wine tasting dashboard with AWS-backed infrastructure definitions.

This repository contains:
- a client-side React application in `src/`
- sample wine data in `src/mockWines.json`
- AWS infrastructure provisioning via Terraform in `infra/`
- a task list in `TODO.md`

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
- `TODO.md` — outstanding work and improvements

## AWS infrastructure

Terraform in `infra/` provisions the following:

- `aws_dynamodb_table.wine_tracker` named `WineTracker` with hash key `wineId`
- `aws_s3_bucket.media` named `wine-tracker-media` for media uploads
- `aws_s3_bucket.website` for the static website host
- `aws_cloudfront_distribution.website_cdn` for website delivery
- bucket ACLs and CORS settings for media uploads

### Terraform backend

Remote state is configured in `infra/backend.tf`:
- bucket: `marten-tfstate`
- key: `wine/terraform.tfstate`
- region: `eu-north-1`
- profile: `sec`

### Provider configuration

`infra/providers.tf` sets:
- AWS region from `var.aws_region`
- AWS profile `dev`

Default variable values in `infra/terraform.tfvars`:
- `aws_region = "eu-north-1"`
- `aws_profile = "dev"`

## Current implementation notes

- The app currently sources wine entries from `src/mockWines.json`.
- Add/edit/delete state is managed in-memory in `src/App.jsx`.
- `src/components/AddWineForm.jsx` includes direct browser-side use of `S3Client`, `PutObjectCommand`, `DynamoDBClient`, and `PutItemCommand`.
- The application is not yet wired to read wine entries from DynamoDB on initial load.

## Important caveats

- Direct AWS SDK use in the browser is not secure for production.
- The current code uses static bucket and table names and would need a backend or signed upload flow for safe deployment.
- Terraform backend and provider profiles differ (`sec` vs `dev`), so AWS profiles must be configured accordingly.

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

3. Configure Terraform variables (for example in `infra/terraform.tfvars`):

```hcl
cloudfront_aliases            = ["mandla.tech", "www.mandla.tech", "wine.mandla.tech"]
cloudfront_acm_certificate_arn = "arn:aws:acm:us-east-1:565393049153:certificate/REPLACE_ME"
```

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

The workflow runs on every push to `main` and performs:

1. `npm ci`
2. `npm run build`
3. `terraform init` in `infra/`
4. `terraform output` to discover `website_bucket_name` and `cloudfront_distribution_id`
5. `aws s3 sync dist/ s3://$WEBSITE_BUCKET --delete`
6. CloudFront invalidation for `/*`

You can also trigger it manually from GitHub via `workflow_dispatch`.

### Manual infrastructure changes

Infrastructure code changes (files in `infra/`) are deployed manually:

1. Make your Terraform changes in `infra/`.
2. Test locally:
```bash
cd infra
terraform plan
terraform apply
```

3. Push changes to main once applied.

The app deploy workflow will continue to work unchanged, reading outputs from applied Terraform state.

## Future work

See `TODO.md` for current tasks, including:
- replacing mock data with live DynamoDB reads
- adding secure AWS upload/authentication flows
- improving mobile and desktop table layout
- sorting same-day wines by composite date+ID keys
- enhancing validation, error handling, and tests

## License

This repo does not include an explicit license.
