# Document Intake Plan

Last updated: June 11, 2026

Owner: Document Intake Agent

## Scope

This pass adds a local file intake adapter layer under `lib/imports/*` for CSV, Excel, PDF, and Word uploads. The layer returns `ImportReviewRecord` records for manager review and never writes directly to source-of-truth employee or task data.

## Current Support

| Format | Adapter | Behavior |
| --- | --- | --- |
| CSV | `csvImportAdapter` | Delegates to the existing `importRowsFromCsv` parser in `lib/workmatch.ts`. Existing employee/task schema detection, confidence, team-size inference, and issue behavior are preserved. |
| Excel | `excelImportAdapter` | Recognizes XLS/XLSX-style uploads and returns a low-confidence fallback review record because no workbook parser dependency exists. |
| PDF | `pdfImportAdapter` | Recognizes PDF uploads and returns a low-confidence fallback review record because no PDF text extraction dependency exists. |
| Word | `wordImportAdapter` | Recognizes DOC/DOCX-style uploads and returns a low-confidence fallback review record because no Word extraction dependency exists. |
| Other | `parseLocalImportSource` | Returns an unsupported fallback review record with conversion guidance. |

## Adapter Contract

Use `parseLocalImportSource(source, { target })` from `lib/imports`.

`source` accepts browser `File`-like objects or simple in-memory content:

```ts
await parseLocalImportSource(file, { target: 'auto' });
await parseLocalImportSource({ name: 'employees.csv', content: csvText }, { target: 'employee' });
```

The result includes:

- `records`: `ImportReviewRecord[]` ready for the existing manager review flow.
- `status`: `parsed`, `fallback`, or `unsupported`.
- `warnings`: human-readable parser warnings.
- `dependencyNotes`: explicit parser dependency and conversion notes for formats that cannot be parsed with current dependencies.

## Dependency Notes

No network installs were performed. Current `package.json` does not include real parsers for workbook, PDF, or Word extraction.

Recommended future parser hooks:

- Excel: `xlsx` or an equivalent workbook parser behind `excelImportAdapter`.
- PDF: `pdf-parse`, `pdfjs-dist`, or an equivalent text/table extractor behind `pdfImportAdapter`.
- Word: `mammoth`, `docx`, or an equivalent DOC/DOCX extractor behind `wordImportAdapter`.

Until those dependencies are approved, managers get explicit fallback review records instead of silent failures or fake extracted data.
