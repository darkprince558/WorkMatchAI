import { createFallbackImportResult } from './fallbacks';
import { getSourceExtension } from './detect';
import { readSourceBytes } from './readers';
import { tableRowsToReviewRecords } from './table-records';
import type { LocalImportAdapter, LocalImportResult, LocalImportSource, ResolvedLocalImportOptions } from './types';
import { getZipText, readZipEntries, ZipParseError } from './zip';
import { descendantsByLocalName, directChildrenByLocalName, getAttrByLocalName, getTextByLocalName, parseXml } from './xml';

export const excelImportAdapter: LocalImportAdapter = {
  format: 'excel',
  async parse(source: LocalImportSource, options: ResolvedLocalImportOptions): Promise<LocalImportResult> {
    if (getSourceExtension(source.name) === 'xls') {
      return createFallbackImportResult({
        sourceFile: source.name,
        format: 'excel',
        target: options.target,
        packageName: 'legacy .xls parser',
        reason: 'Binary .xls files are not ZIP/XML workbooks and need a dedicated legacy Excel parser',
        fallback: 'Save the workbook as .xlsx or CSV before importing.',
        status: 'fallback',
      });
    }

    try {
      const bytes = await readSourceBytes(source);
      const entries = await readZipEntries(bytes);
      const workbookXml = getZipText(entries, 'xl/workbook.xml');
      const workbookRelsXml = getZipText(entries, 'xl/_rels/workbook.xml.rels');

      if (!workbookXml || !workbookRelsXml) {
        throw new ZipParseError('Workbook metadata was not found.');
      }

      const sharedStrings = parseSharedStrings(getZipText(entries, 'xl/sharedStrings.xml'));
      const sheets = parseWorkbookSheets(workbookXml, workbookRelsXml);
      const warnings: string[] = [];
      const records = sheets.flatMap((sheet) => {
        const worksheetXml = getZipText(entries, sheet.path);
        if (!worksheetXml) {
          warnings.push(`Sheet ${sheet.name} was listed in the workbook but its XML was not found.`);
          return [];
        }

        const rows = parseWorksheetRows(worksheetXml, sharedStrings);
        const sheetRecords = tableRowsToReviewRecords(rows, {
          sourceFile: source.name,
          sheetName: sheet.name,
          target: options.target,
        });

        if (!sheetRecords.length) {
          warnings.push(`Sheet ${sheet.name} did not contain a header row plus importable data rows.`);
        }

        return sheetRecords;
      });

      return {
        sourceFile: source.name,
        format: 'excel',
        target: options.target,
        status: records.length ? 'parsed' : 'fallback',
        records,
        warnings: records.length ? warnings : ['Excel workbook parsed, but no WorkMatch employee or task review records were detected.', ...warnings],
        dependencyNotes: [],
      };
    } catch (error) {
      return createFallbackImportResult({
        sourceFile: source.name,
        format: 'excel',
        target: options.target,
        reason: error instanceof Error ? error.message : 'Excel workbook parsing failed',
        fallback: 'Save the workbook as CSV, or use a simple .xlsx sheet with headers in the first row.',
        status: 'fallback',
      });
    }
  },
};

interface WorkbookSheet {
  name: string;
  path: string;
}

function parseWorkbookSheets(workbookXml: string, workbookRelsXml: string): WorkbookSheet[] {
  const workbook = parseXml(workbookXml, 'workbook');
  const rels = parseXml(workbookRelsXml, 'workbook relationships');
  const relationshipTargets = new Map(
    descendantsByLocalName(rels, 'Relationship').map((relationship) => [
      relationship.getAttribute('Id') ?? '',
      normalizeWorkbookTarget(relationship.getAttribute('Target') ?? ''),
    ])
  );

  return descendantsByLocalName(workbook, 'sheet').map((sheet, index) => {
    const relationshipId = getAttrByLocalName(sheet, 'id') ?? `rId${index + 1}`;
    return {
      name: sheet.getAttribute('name') || `Sheet ${index + 1}`,
      path: relationshipTargets.get(relationshipId) ?? `xl/worksheets/sheet${index + 1}.xml`,
    };
  });
}

function parseSharedStrings(sharedStringsXml?: string) {
  if (!sharedStringsXml) return [];

  const document = parseXml(sharedStringsXml, 'shared strings');
  return descendantsByLocalName(document, 'si').map((item) =>
    descendantsByLocalName(item, 't')
      .map((text) => text.textContent ?? '')
      .join('')
  );
}

function parseWorksheetRows(worksheetXml: string, sharedStrings: string[]) {
  const document = parseXml(worksheetXml, 'worksheet');

  return descendantsByLocalName(document, 'row').map((row) => {
    const cells = directChildrenByLocalName(row, 'c');
    const parsedCells = cells.map((cell) => ({
      index: columnIndexFromReference(cell.getAttribute('r') ?? ''),
      value: readCellValue(cell, sharedStrings),
    }));
    const maxIndex = Math.max(-1, ...parsedCells.map((cell) => cell.index));
    const rowValues = Array.from({ length: maxIndex + 1 }, () => '');
    parsedCells.forEach((cell) => {
      rowValues[cell.index] = cell.value;
    });
    return rowValues;
  });
}

function readCellValue(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute('t');
  const value = directChildrenByLocalName(cell, 'v')[0]?.textContent ?? '';

  if (type === 's') return sharedStrings[Number(value)] ?? '';
  if (type === 'inlineStr') return getTextByLocalName(cell, 't');
  if (type === 'b') return value === '1' ? 'true' : 'false';

  return value;
}

function normalizeWorkbookTarget(target: string) {
  if (target.startsWith('/')) return target.replace(/^\/+/, '');
  if (target.startsWith('xl/')) return target;
  return `xl/${target.replace(/^\/+/, '')}`;
}

function columnIndexFromReference(reference: string) {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? 'A';
  return letters.split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}
