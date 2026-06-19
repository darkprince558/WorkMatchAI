import { csvImportAdapter } from './csv';
import { detectLocalImportFormat } from './detect';
import { excelImportAdapter } from './excel';
import { createFallbackImportResult } from './fallbacks';
import { pdfImportAdapter } from './pdf';
import { wordImportAdapter } from './word';
import type { LocalImportAdapter, LocalImportOptions, LocalImportSource } from './types';
import { resolveLocalImportOptions } from './types';

const localImportAdapters: Record<string, LocalImportAdapter> = {
  csv: csvImportAdapter,
  excel: excelImportAdapter,
  pdf: pdfImportAdapter,
  word: wordImportAdapter,
};

const maxLocalImportBytes = 25 * 1024 * 1024;

export async function parseLocalImportSource(source: LocalImportSource, options: LocalImportOptions = {}) {
  const resolvedOptions = resolveLocalImportOptions(options);

  if (source.size && source.size > maxLocalImportBytes) {
    return createFallbackImportResult({
      sourceFile: source.name,
      format: 'unsupported',
      target: resolvedOptions.target,
      reason: 'Selected file exceeds the local import size limit',
      fallback: 'Use a file under 25 MB, or split the source into smaller CSV, XLSX, PDF, or DOCX files',
      status: 'unsupported',
    });
  }

  const format = detectLocalImportFormat(source);
  const adapter = localImportAdapters[format];

  if (adapter) {
    return adapter.parse(source, resolvedOptions);
  }

  return createFallbackImportResult({
    sourceFile: source.name,
    format: 'unsupported',
    target: resolvedOptions.target,
    reason: 'No supported local parser matched this file extension or MIME type',
    fallback: 'Use CSV, XLS/XLSX, PDF, or DOC/DOCX inputs, or convert the file to CSV before import',
    status: 'unsupported',
  });
}

export { detectLocalImportFormat };
