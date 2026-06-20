# Wine Tracker To-do

## Data persistence
- Replace local mock data with real DynamoDB loading in `src/App.jsx`.
- Persist add/edit/delete actions to DynamoDB instead of only local state.
- Use a composite primary key for same-date wines: `YYYYMMDD-1`, `YYYYMM09-2`, etc.
- Sort same-day wines by ID by default when dates are equal.
- Remove the need for `timestamp` as a database key field if date + ID is used.

## Image handling
- Confirm S3 upload flow in `src/components/AddWineForm.jsx` and remove hard-coded AWS credentials.
- Add image preview and validation before upload.
- Add error handling for failed S3 uploads.

## Form + validation
- Improve validation for `vol` / ABV values and member ratings.
- Add inline form validation messages and disable submit during save.
- Keep editing flows consistent and preserve UX when closing the form.
- Only Wine Name and Tasted Date are mandatory; all other fields are optional.
- Country field should use a dropdown (with emoji flags) instead of a free-text input.
- Add a Cancel button below Save Wine with the same effect as Close.

## Table UX
- Make the table comfortable to read on desktop and mobile, ensuring all member columns and action buttons are visible.
- Add a better responsive layout for the wine table and wrapped content if needed.
- Add an empty state for no wines and no search/filter results.
- Move Group Avg column to appear next to Wine Name column.
- Show the country's emoji flag next to the country name in the table.
- Display all dates in dd.mm.yyyy format throughout the app.
- Add a Details button per row that opens a panel/modal with all secondary info (country, closure, ABV, comment, member ratings); the main table shows only image, date, wine name, and group avg.
- Add pagination to the wine table (30 wines per page) so all wines are not loaded and rendered at once.

## Member filtering and highlights
- When filtering by group member, sort by default by top wines for that member.
- Highlight top 3 and top 5 wines in a separate place (not just inside the table rows).
- Move top 3/top 5 highlighting to a dedicated UI section or summary area.

## Infrastructure and environment
- Wire up `infra/` Terraform resources for DynamoDB, S3, and IAM.
- Add environment variable support for AWS region, bucket name, and table name.
- Document deployment/local setup in `README.md`.

## Testing and cleanup
- Add tests for `AddWineForm`, `WineTable`, and `DashboardMetrics`.
- Add integration tests for add/edit/delete/search workflows.
- Run ESLint and resolve any issues.
