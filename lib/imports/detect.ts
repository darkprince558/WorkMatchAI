import type { LocalImportFormat, LocalImportSource } from './types';

const excelExtensions = new Set(['xls', 'xlsx', 'xlsm', 'xlsb']);
const wordExtensions = new Set(['doc', 'docx']);

export function detectLocalImportFormat(source: LocalImportSource): LocalImportFormat {
  const extension = getSourceExtension(source.name);
  const mimeType = getSourceMimeType(source);

  if (extension === 'csv' || mimeType === 'text/csv' || mimeType.includes('csv')) return 'csv';
  if (excelExtensions.has(extension) || isExcelMimeType(mimeType)) return 'excel';
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (wordExtensions.has(extension) || isWordMimeType(mimeType)) return 'word';

  return 'unsupported';
}

export function getSourceMimeType(source: LocalImportSource) {
  return (source.mimeType ?? source.type ?? '').toLowerCase().trim();
}

export function getSourceExtension(name: string) {
  const lastSegment = name.split(/[\\/]/).pop() ?? name;
  const extension = lastSegment.includes('.') ? lastSegment.split('.').pop() : '';
  return (extension ?? '').toLowerCase().trim();
}

function isExcelMimeType(mimeType: string) {
  return (
    mimeType.includes('spreadsheetml') ||
    mimeType.includes('ms-excel') ||
    mimeType.includes('vnd.ms-excel') ||
    mimeType.includes('vnd.openxmlformats-officedocument.spreadsheetml')
  );
}

function isWordMimeType(mimeType: string) {
  return (
    mimeType.includes('msword') ||
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('vnd.openxmlformats-officedocument.wordprocessingml')
  );
}
