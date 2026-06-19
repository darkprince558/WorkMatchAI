import { importRowsFromCsv } from '../workmatch';
import type { ImportReviewRecord, ImportTarget } from '../types';

export interface TableToReviewOptions {
  sourceFile: string;
  target: ImportTarget;
  sheetName?: string;
}

export function tableRowsToReviewRecords(rows: string[][], options: TableToReviewOptions): ImportReviewRecord[] {
  const normalizedRows = normalizeTableRows(rows);
  if (normalizedRows.length < 2) return [];

  const sourceName = options.sheetName ? `${options.sourceFile}:${options.sheetName}` : options.sourceFile;
  return importRowsFromCsv(tableRowsToCsv(normalizedRows), sourceName, options.target);
}

export function delimitedTextToReviewRecords(text: string, options: TableToReviewOptions): ImportReviewRecord[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitTableLine)
    .filter((row) => row.length > 1);

  return tableRowsToReviewRecords(rows, options);
}

export function normalizeTableRows(rows: string[][]) {
  const trimmedRows = rows
    .map((row) => row.map((cell) => normalizeCell(cell)))
    .filter((row) => row.some(Boolean));
  const maxColumns = Math.max(0, ...trimmedRows.map((row) => row.length));

  return trimmedRows.map((row) => Array.from({ length: maxColumns }, (_, index) => row[index] ?? ''));
}

function tableRowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function splitTableLine(line: string) {
  if (line.includes('\t')) return line.split('\t').map(normalizeCell);
  if (line.includes('|')) return line.split('|').map(normalizeCell);
  if (line.includes(',')) return splitCsvLikeLine(line).map(normalizeCell);
  return line.split(/\s{2,}/).map(normalizeCell);
}

function splitCsvLikeLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function escapeCsvCell(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeCell(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}
