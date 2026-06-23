# Google Workspace Intake Plan

Owner: Google Workspace Agent

Scope: `lib/google-workspace/*` creates connector/OAuth adapter contracts for Google Docs and Google Sheets. The adapters do not fetch from Google directly and do not write employee, task, roster, or assignment data. They accept content supplied by a connector or an OAuth/service-account route, transform it through the shared document extraction proposal model, and return `ImportReviewRecord[]` for manager review.

## Status Update - 2026-06-23

- First live-ish Sheets intake is implemented in `lib/imports/google-sheets.ts` and `POST /api/google-workspace/intake`.
- The route accepts connector-provided or posted rows, tabs, and ranges, normalizes friendly Google Sheets headers, and returns `reviewRecords` plus preview validation.
- It does not fetch Google APIs or implement OAuth/service-account access yet; local CSV/XLSX/PDF/Word import remains separate.

## Adapter Contract

- `googleDocsContentToImportReviewRecords(document, options)` accepts a fetched Google Doc payload with table rows or a prebuilt `DocumentExtractionAssistanceOutput`.
- `googleSheetsContentToImportReviewRecords(spreadsheet, options)` accepts fetched spreadsheet ranges or a prebuilt `DocumentExtractionAssistanceOutput`.
- Both adapters return `GoogleWorkspaceIntakeResult` with `status`, `reviewRecords`, `extraction`, `warnings`, and an optional `fallback`.
- Tabular content is normalized into the agent extraction contract first, then converted to WorkMatch `ImportReviewRecord` objects. This keeps Google intake aligned with the shared review model and avoids direct source-of-truth writes.
- `target: "roster"` intentionally returns a fallback until the roster adapter owns assignment review records.

## Required Env And Config

Connector-first deployments can pass `access: { provider: "connector", connectorAvailable: true }` and provide already-fetched document or spreadsheet content.

OAuth deployments need:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_DRIVE_SCOPES`

`GOOGLE_DRIVE_SCOPES` should include:

- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/documents.readonly` for Docs
- `https://www.googleapis.com/auth/spreadsheets.readonly` for Sheets

Service-account deployments can use:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

## Fallback Behavior

- Missing connector and missing OAuth/service-account credentials returns `status: "fallback"` with `reason: "connector_unavailable"` or `reason: "credentials_unavailable"`.
- Missing fetched source content returns `reason: "source_content_unavailable"`.
- Unsupported roster target returns `reason: "unsupported_import_target"`.
- Content that is available but does not contain importable employee/task rows returns `reason: "no_importable_records"`.
- Fallback results contain no review records and never commit data.

## Expected Input Shapes

Google Docs tables and Google Sheets ranges should use familiar headers such as:

- Employees: `employee_id`, `name`, `role`, `department`, `location`, `capacity_percent`, `skills`, `certifications`, `interests`, `career_goals`
- Tasks: `task_id`, `name`, `description`, `required_skills`, `optional_skills`, `urgency`, `deadline`, `estimated_hours`, `staffing_mode`, `team_size`

Skills use the existing WorkMatch style: `React:8|SQL:7` for employee skills and `React:7:high|SQL:6:medium` for task requirements.

## Next Integration Step

Route handlers can fetch Google content with the selected access model, pass tables/ranges into these adapters, then hand the returned `reviewRecords` to the same import review queue used by CSV. Unstructured Docs should first use the document extraction assistance agent to produce `DocumentExtractionAssistanceOutput`, then pass that proposal into the Docs adapter.
