import type { ImportReviewRecord, ImportTarget } from '../types';
import { normalizeTableRows, tableRowsToReviewRecords } from './table-records';

export type GoogleSheetsIntakeStatus = 'parsed' | 'fallback';

export interface GoogleSheetsIntakeOptions {
  target?: ImportTarget;
  sourceName?: string;
}

export interface GoogleSheetsHeaderMapping {
  columnIndex: number;
  sourceHeader: string;
  mappedHeader: string;
  canonicalHeader?: string;
  status: 'mapped' | 'unmapped';
}

export interface GoogleSheetsRangePreview {
  sheetName: string;
  range?: string;
  sourceLabel: string;
  headerRowIndex: number;
  rowCount: number;
  columnCount: number;
  importableRowCount: number;
  recordCount: number;
  detectedSchema: 'employee' | 'task' | 'mixed' | 'unknown';
  headerMappings: GoogleSheetsHeaderMapping[];
  unmappedHeaders: string[];
  duplicateHeaders: string[];
  sampleRows: Record<string, string>[];
  issues: string[];
}

export interface GoogleSheetsIntakeResult {
  source: 'google_sheets';
  sourceFile: string;
  target: ImportTarget;
  status: GoogleSheetsIntakeStatus;
  reviewRecords: ImportReviewRecord[];
  records: ImportReviewRecord[];
  preview: GoogleSheetsRangePreview[];
  warnings: string[];
  fallback?: {
    reason: 'source_content_unavailable' | 'unsupported_import_target' | 'no_importable_records';
    message: string;
  };
}

interface ExtractedSheetRange {
  sheetName: string;
  range?: string;
  sourceLabel: string;
  rows: string[][];
}

interface PreparedRange {
  rows: string[][];
  preview: Omit<GoogleSheetsRangePreview, 'recordCount'>;
}

const defaultSourceName = 'Google Sheets intake';
const defaultSheetName = 'Sheet 1';
const maxHeaderSearchRows = 10;
const previewRowLimit = 3;

const employeeHeaders = new Set([
  'employee_id',
  'role',
  'department',
  'availability',
  'availability_status',
  'capacity_percent',
  'years_experience',
  'skills',
  'certifications',
  'past_projects',
  'interests',
  'career_goals',
  'timezone',
]);

const taskHeaders = new Set([
  'task_id',
  'description',
  'required_skills',
  'optional_skills',
  'urgency',
  'deadline',
  'estimated_hours',
  'team_size',
  'remote_status',
  'seniority_required',
  'staffing_mode',
  'status',
  'type',
]);

const commonHeaders = new Set(['id', 'name', 'location']);
const knownHeaders = new Set([...commonHeaders, ...employeeHeaders, ...taskHeaders]);

const aliasEntries: Array<{ canonical: string; aliases: string[]; targets?: ImportTarget[] }> = [
  { canonical: 'id', aliases: ['id', 'record id', 'workmatch id'] },
  { canonical: 'name', aliases: ['name', 'full name', 'employee name', 'task name', 'project name', 'request name'] },
  { canonical: 'location', aliases: ['location', 'city', 'office', 'region', 'work location'] },
  { canonical: 'employee_id', aliases: ['employee id', 'employeeid', 'employee number', 'employee no', 'person id', 'staff id', 'worker id'] },
  { canonical: 'role', aliases: ['role', 'job title', 'title', 'position'] },
  { canonical: 'department', aliases: ['department', 'dept', 'practice', 'team'] },
  { canonical: 'availability', aliases: ['availability'], targets: ['employee', 'roster'] },
  { canonical: 'availability_status', aliases: ['availability status', 'availability state'] },
  {
    canonical: 'capacity_percent',
    aliases: ['capacity percent', 'capacity pct', 'capacity', 'capacity %', 'available percent', 'available pct', 'available %', 'utilization percent'],
  },
  { canonical: 'years_experience', aliases: ['years experience', 'years exp', 'experience years', 'yoe', 'experience'] },
  { canonical: 'skills', aliases: ['skills', 'employee skills', 'capabilities', 'skill inventory'] },
  { canonical: 'certifications', aliases: ['certifications', 'certificates', 'credentials'] },
  { canonical: 'past_projects', aliases: ['past projects', 'project history', 'previous projects'] },
  { canonical: 'interests', aliases: ['interests', 'growth interests', 'career interests'] },
  { canonical: 'career_goals', aliases: ['career goals', 'career goal', 'goals'] },
  { canonical: 'timezone', aliases: ['timezone', 'time zone'] },
  { canonical: 'task_id', aliases: ['task id', 'taskid', 'project id', 'request id', 'work id', 'assignment id'] },
  { canonical: 'description', aliases: ['description', 'summary', 'scope', 'project description', 'task description'] },
  { canonical: 'required_skills', aliases: ['required skills', 'required skill', 'must have skills', 'needs', 'demand skills'] },
  { canonical: 'optional_skills', aliases: ['optional skills', 'nice to have skills', 'bonus skills', 'preferred skills'] },
  { canonical: 'urgency', aliases: ['urgency', 'priority'] },
  { canonical: 'deadline', aliases: ['deadline', 'due date', 'target date', 'end date'] },
  { canonical: 'estimated_hours', aliases: ['estimated hours', 'estimated hrs', 'est hours', 'est hrs', 'hours', 'effort hours', 'effort'] },
  { canonical: 'team_size', aliases: ['team size', 'headcount', 'required people', 'required employees', 'staff required', 'staff needed'] },
  { canonical: 'remote_status', aliases: ['remote status', 'remote', 'work mode', 'onsite remote', 'hybrid'] },
  { canonical: 'seniority_required', aliases: ['seniority required', 'seniority', 'level', 'required seniority'] },
  { canonical: 'staffing_mode', aliases: ['staffing mode', 'staffing', 'assignment mode'] },
  { canonical: 'status', aliases: ['status', 'task status', 'project status'], targets: ['task', 'auto'] },
  { canonical: 'type', aliases: ['type', 'work type', 'project type', 'task type'], targets: ['task', 'auto'] },
];

const aliasLookup = aliasEntries.reduce((lookup, entry) => {
  entry.aliases.forEach((alias) => {
    lookup.set(normalizeHeaderLabel(alias), entry);
  });
  lookup.set(normalizeHeaderLabel(entry.canonical), entry);
  return lookup;
}, new Map<string, (typeof aliasEntries)[number]>());

export function googleSheetsContentToImportReviewRecords(
  content: unknown,
  options: GoogleSheetsIntakeOptions = {}
): GoogleSheetsIntakeResult {
  const target = options.target ?? readTarget(content) ?? 'auto';
  const sourceFile = readSourceName(content, options.sourceName);

  if (target === 'roster') {
    return createFallbackResult(sourceFile, target, 'unsupported_import_target', 'Google Sheets roster intake is not supported yet. Use employee or task targets.');
  }

  const ranges = extractSheetRanges(content);

  if (!ranges.length) {
    return createFallbackResult(
      sourceFile,
      target,
      'source_content_unavailable',
      'Post connector-provided Google Sheets rows, ranges, tabs, or a spreadsheet payload before starting intake.'
    );
  }

  const warnings: string[] = [];
  const reviewRecords: ImportReviewRecord[] = [];
  const preview: GoogleSheetsRangePreview[] = [];

  ranges.forEach((range) => {
    const prepared = prepareRangeForReview(range, target);
    const records = prepared.rows.length
      ? tableRowsToReviewRecords(prepared.rows, {
          sourceFile,
          target,
          sheetName: range.sourceLabel,
        })
      : [];

    preview.push({ ...prepared.preview, recordCount: records.length });
    reviewRecords.push(...records);
    prepared.preview.issues.forEach((issue) => warnings.push(`${range.sourceLabel}: ${issue}`));
  });

  if (!reviewRecords.length) {
    return {
      source: 'google_sheets',
      sourceFile,
      target,
      status: 'fallback',
      reviewRecords,
      records: reviewRecords,
      preview,
      warnings: warnings.length ? warnings : ['No importable Google Sheets employee or task records were found.'],
      fallback: {
        reason: 'no_importable_records',
        message: 'The posted Google Sheets content did not contain a recognizable header row plus data rows.',
      },
    };
  }

  return {
    source: 'google_sheets',
    sourceFile,
    target,
    status: 'parsed',
    reviewRecords,
    records: reviewRecords,
    preview,
    warnings,
  };
}

function createFallbackResult(
  sourceFile: string,
  target: ImportTarget,
  reason: NonNullable<GoogleSheetsIntakeResult['fallback']>['reason'],
  message: string
): GoogleSheetsIntakeResult {
  return {
    source: 'google_sheets',
    sourceFile,
    target,
    status: 'fallback',
    reviewRecords: [],
    records: [],
    preview: [],
    warnings: [message],
    fallback: {
      reason,
      message,
    },
  };
}

function prepareRangeForReview(range: ExtractedSheetRange, target: ImportTarget): PreparedRange {
  const normalizedRows = normalizeTableRows(range.rows);
  const issues: string[] = [];

  if (normalizedRows.length < 2) {
    issues.push('Range needs a header row plus at least one data row.');
    return {
      rows: [],
      preview: {
        sheetName: range.sheetName,
        range: range.range,
        sourceLabel: range.sourceLabel,
        headerRowIndex: 0,
        rowCount: normalizedRows.length,
        columnCount: normalizedRows[0]?.length ?? 0,
        importableRowCount: 0,
        detectedSchema: 'unknown',
        headerMappings: [],
        unmappedHeaders: [],
        duplicateHeaders: [],
        sampleRows: [],
        issues,
      },
    };
  }

  const headerRowIndex = findHeaderRowIndex(normalizedRows, target);
  const originalHeaders = normalizedRows[headerRowIndex] ?? [];
  const mapped = mapHeaders(originalHeaders, target);
  const dataRows = normalizedRows.slice(headerRowIndex + 1).filter((row) => row.some(Boolean));
  const detectedSchema = detectSchema(mapped.mappings);
  const preparedRows = dataRows.length ? [mapped.headers, ...dataRows] : [];

  if (!mapped.mappings.some((mapping) => mapping.status === 'mapped')) {
    issues.push('No recognizable WorkMatch headers found. Use headers like employee_id, name, skills, task_id, required_skills, or estimated_hours.');
  }

  if (!dataRows.length) {
    issues.push('Range does not contain any non-empty data rows below the header.');
  }

  if (mapped.unmappedHeaders.length) {
    issues.push(`Unmapped headers were ignored by the importer: ${mapped.unmappedHeaders.join(', ')}.`);
  }

  if (mapped.duplicateHeaders.length) {
    issues.push(`Duplicate mapped headers were renamed for preview: ${mapped.duplicateHeaders.join(', ')}.`);
  }

  return {
    rows: preparedRows,
    preview: {
      sheetName: range.sheetName,
      range: range.range,
      sourceLabel: range.sourceLabel,
      headerRowIndex,
      rowCount: normalizedRows.length,
      columnCount: Math.max(0, ...normalizedRows.map((row) => row.length)),
      importableRowCount: dataRows.length,
      detectedSchema,
      headerMappings: mapped.mappings,
      unmappedHeaders: mapped.unmappedHeaders,
      duplicateHeaders: mapped.duplicateHeaders,
      sampleRows: buildSampleRows(mapped.headers, dataRows),
      issues,
    },
  };
}

function extractSheetRanges(content: unknown): ExtractedSheetRange[] {
  const root = unwrapSpreadsheet(content);
  const ranges: ExtractedSheetRange[] = [];

  const directRange = rangeFromObject(root, {
    fallbackSheetName: readSheetName(root) ?? defaultSheetName,
    fallbackRange: readStringProperty(root, 'range'),
  });
  if (directRange) ranges.push(directRange);

  if (!isPlainObject(root)) return ranges;

  const tabs = readArrayProperty(root, 'sheets') ?? readArrayProperty(root, 'tabs') ?? readArrayProperty(root, 'worksheets') ?? [];
  tabs.forEach((tab, index) => {
    const sheetName = readSheetName(tab) ?? `Sheet ${index + 1}`;
    const tabRanges = readArrayProperty(tab, 'ranges') ?? readArrayProperty(tab, 'valueRanges') ?? readArrayProperty(tab, 'data');

    if (tabRanges?.length) {
      tabRanges.forEach((rangeInput) => {
        const range = rangeFromObject(rangeInput, {
          fallbackSheetName: readSheetName(rangeInput) ?? sheetName,
          fallbackRange: readStringProperty(rangeInput, 'range'),
        });
        if (range) ranges.push(range);
      });
      return;
    }

    const range = rangeFromObject(tab, {
      fallbackSheetName: sheetName,
      fallbackRange: readStringProperty(tab, 'range'),
    });
    if (range) ranges.push(range);
  });

  return ranges;
}

function rangeFromObject(
  input: unknown,
  options: {
    fallbackSheetName: string;
    fallbackRange?: string;
  }
): ExtractedSheetRange | undefined {
  const rowsSource = readRowsSource(input);
  if (!rowsSource) return undefined;

  const majorDimension = readStringProperty(input, 'majorDimension')?.toUpperCase();
  const rows = majorDimension === 'COLUMNS' ? transposeRows(rowsSource) : rowsSource;
  const range = readStringProperty(input, 'range') ?? options.fallbackRange;
  const sheetName = readSheetName(input) ?? readSheetNameFromRange(range) ?? options.fallbackSheetName;
  const sourceLabel = buildSourceLabel(sheetName, range);

  return {
    sheetName,
    range,
    sourceLabel,
    rows,
  };
}

function readRowsSource(input: unknown): string[][] | undefined {
  if (Array.isArray(input)) return rowsInputToGrid(input);
  if (!isPlainObject(input)) return undefined;

  const valueRows = readArrayProperty(input, 'values') ?? readArrayProperty(input, 'rows') ?? readArrayProperty(input, 'records');
  if (valueRows) return rowsInputToGrid(valueRows);

  const rowData = readArrayProperty(input, 'rowData');
  if (rowData) return rowDataToRows(rowData);

  return undefined;
}

function rowsInputToGrid(rows: unknown[]): string[][] {
  if (rows.every(isPlainObject)) return objectRowsToGrid(rows as Record<string, unknown>[]);

  return rows
    .map((row) => {
      if (Array.isArray(row)) return row.map(cellToString);
      if (isPlainObject(row)) return objectRowsToGrid([row])[1] ?? [];
      return [cellToString(row)];
    })
    .filter((row) => row.some(Boolean));
}

function objectRowsToGrid(rows: Record<string, unknown>[]): string[][] {
  const headers: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!headers.includes(key)) headers.push(key);
    });
  });

  return [headers, ...rows.map((row) => headers.map((header) => cellToString(row[header])))];
}

function rowDataToRows(rowData: unknown[]): string[][] {
  return rowData
    .map((row) => {
      if (!isPlainObject(row)) return [];
      const values = readArrayProperty(row, 'values') ?? [];
      return values.map(cellToString);
    })
    .filter((row) => row.some(Boolean));
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string') return cell.replace(/\s+/g, ' ').trim();
  if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell);

  if (isPlainObject(cell)) {
    const directValue =
      cell.formattedValue ??
      cell.effectiveValue ??
      cell.userEnteredValue ??
      cell.value ??
      cell.stringValue ??
      cell.numberValue ??
      cell.boolValue;

    if (directValue !== undefined) {
      if (isPlainObject(directValue)) {
        return cellToString(
          directValue.stringValue ??
            directValue.numberValue ??
            directValue.boolValue ??
            directValue.formulaValue ??
            directValue.value
        );
      }

      return cellToString(directValue);
    }
  }

  return '';
}

function findHeaderRowIndex(rows: string[][], target: ImportTarget) {
  const candidates = rows.slice(0, maxHeaderSearchRows);
  let bestIndex = 0;
  let bestScore = -1;

  candidates.forEach((row, index) => {
    const score = scoreHeaderRow(row, target);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestIndex;
}

function scoreHeaderRow(row: string[], target: ImportTarget) {
  const mappedHeaders = new Set<string>();
  row.forEach((cell) => {
    const canonical = canonicalHeaderFor(cell, target);
    if (canonical) mappedHeaders.add(canonical);
  });

  return mappedHeaders.size;
}

function mapHeaders(headers: string[], target: ImportTarget) {
  const counts = new Map<string, number>();
  const unmappedHeaders: string[] = [];
  const duplicateHeaders: string[] = [];

  const mappings = headers.map<GoogleSheetsHeaderMapping>((sourceHeader, columnIndex) => {
    const canonicalHeader = canonicalHeaderFor(sourceHeader, target);
    const fallbackHeader = safeHeader(sourceHeader) || `column_${columnIndex + 1}`;
    const baseHeader = canonicalHeader ?? fallbackHeader;
    const seen = counts.get(baseHeader) ?? 0;
    counts.set(baseHeader, seen + 1);

    if (!canonicalHeader && sourceHeader.trim()) unmappedHeaders.push(sourceHeader);
    if (seen > 0) duplicateHeaders.push(baseHeader);

    return {
      columnIndex,
      sourceHeader,
      mappedHeader: seen > 0 ? `${baseHeader}_${seen + 1}` : baseHeader,
      canonicalHeader,
      status: canonicalHeader ? 'mapped' : 'unmapped',
    };
  });

  return {
    headers: mappings.map((mapping) => mapping.mappedHeader),
    mappings,
    unmappedHeaders,
    duplicateHeaders,
  };
}

function canonicalHeaderFor(header: string, target: ImportTarget) {
  const normalized = normalizeHeaderLabel(header);
  if (!normalized) return undefined;

  const snakeCaseHeader = normalized.replace(/\s+/g, '_');
  if (knownHeaders.has(snakeCaseHeader)) return snakeCaseHeader;

  const entry = aliasLookup.get(normalized);
  if (!entry) return undefined;
  if (entry.targets && !entry.targets.includes(target)) return undefined;

  return entry.canonical;
}

function detectSchema(mappings: GoogleSheetsHeaderMapping[]): GoogleSheetsRangePreview['detectedSchema'] {
  let employeeScore = 0;
  let taskScore = 0;

  mappings.forEach((mapping) => {
    const header = mapping.canonicalHeader;
    if (!header) return;
    if (employeeHeaders.has(header)) employeeScore += 1;
    if (taskHeaders.has(header)) taskScore += 1;
  });

  if (employeeScore && taskScore) return 'mixed';
  if (employeeScore) return 'employee';
  if (taskScore) return 'task';
  return 'unknown';
}

function buildSampleRows(headers: string[], dataRows: string[][]) {
  return dataRows.slice(0, previewRowLimit).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}

function transposeRows(rows: string[][]) {
  const maxColumns = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: maxColumns }, (_, columnIndex) => rows.map((row) => row[columnIndex] ?? ''));
}

function buildSourceLabel(sheetName: string, range?: string) {
  if (!range) return sheetName;
  if (range.includes('!')) return range;
  return `${sheetName}!${range}`;
}

function readSourceName(content: unknown, optionSourceName?: string) {
  if (optionSourceName?.trim()) return optionSourceName.trim();

  const root = unwrapSpreadsheet(content);
  const body = isPlainObject(content) ? content : undefined;

  return (
    readStringProperty(body, 'sourceName') ??
    readStringProperty(body, 'sourceFile') ??
    readStringProperty(root, 'sourceName') ??
    readStringProperty(root, 'spreadsheetName') ??
    readStringProperty(root, 'title') ??
    readStringProperty(root, 'name') ??
    readStringProperty(root, 'spreadsheetId') ??
    readStringProperty(root, 'id') ??
    defaultSourceName
  );
}

function readTarget(content: unknown): ImportTarget | undefined {
  const root = isPlainObject(content) ? content : undefined;
  const value = readStringProperty(root, 'target') ?? readStringProperty(root, 'importTarget');
  if (value === 'auto' || value === 'employee' || value === 'task' || value === 'roster') return value;
}

function unwrapSpreadsheet(content: unknown) {
  if (isPlainObject(content) && isPlainObject(content.spreadsheet)) return content.spreadsheet;
  return content;
}

function readSheetName(input: unknown) {
  if (!isPlainObject(input)) return undefined;
  const properties = isPlainObject(input.properties) ? input.properties : undefined;

  return (
    readStringProperty(input, 'sheetName') ??
    readStringProperty(input, 'title') ??
    readStringProperty(input, 'name') ??
    readStringProperty(properties, 'title')
  );
}

function readSheetNameFromRange(range?: string) {
  if (!range?.includes('!')) return undefined;
  return range
    .split('!')[0]
    .replace(/^'/, '')
    .replace(/'$/, '')
    .replace(/''/g, "'")
    .trim();
}

function readStringProperty(input: unknown, key: string) {
  if (!isPlainObject(input)) return undefined;
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readArrayProperty(input: unknown, key: string) {
  if (!isPlainObject(input)) return undefined;
  const value = input[key];
  return Array.isArray(value) ? value : undefined;
}

function normalizeHeaderLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeHeader(value: string) {
  return normalizeHeaderLabel(value).replace(/\s+/g, '_');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
