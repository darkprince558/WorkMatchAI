import { createFallbackImportResult } from './fallbacks';
import { getSourceExtension } from './detect';
import { readSourceBytes } from './readers';
import { delimitedTextToReviewRecords, tableRowsToReviewRecords } from './table-records';
import type { LocalImportAdapter, LocalImportResult, LocalImportSource, ResolvedLocalImportOptions } from './types';
import { getZipText, readZipEntries, ZipParseError } from './zip';
import { descendantsByLocalName, directChildrenByLocalName, parseXml } from './xml';

export const wordImportAdapter: LocalImportAdapter = {
  format: 'word',
  async parse(source: LocalImportSource, options: ResolvedLocalImportOptions): Promise<LocalImportResult> {
    if (getSourceExtension(source.name) === 'doc') {
      return createFallbackImportResult({
        sourceFile: source.name,
        format: 'word',
        target: options.target,
        packageName: 'legacy .doc parser',
        reason: 'Binary .doc files are not ZIP/XML documents and need a dedicated Word binary parser',
        fallback: 'Save the document as .docx, or copy the table into CSV before importing.',
        status: 'fallback',
      });
    }

    try {
      const document = await readWordDocument(source);
      const tableRecords = descendantsByLocalName(document, 'tbl').flatMap((table, index) =>
        tableRowsToReviewRecords(readWordTable(table), {
          sourceFile: source.name,
          sheetName: `Table ${index + 1}`,
          target: options.target,
        })
      );
      const text = readWordParagraphText(document);
      const textRecords = tableRecords.length
        ? []
        : delimitedTextToReviewRecords(text, {
            sourceFile: source.name,
            target: options.target,
          });
      const records = [...tableRecords, ...textRecords];

      return {
        sourceFile: source.name,
        format: 'word',
        target: options.target,
        status: records.length ? 'parsed' : 'fallback',
        records,
        warnings: records.length
          ? []
          : ['Word document parsed, but no importable table or delimited employee/task rows were detected.'],
        dependencyNotes: [],
      };
    } catch (error) {
      return createFallbackImportResult({
        sourceFile: source.name,
        format: 'word',
        target: options.target,
        reason: error instanceof Error ? error.message : 'Word document parsing failed',
        fallback: 'Use a .docx document with a simple table, or export the table to CSV.',
        status: 'fallback',
      });
    }
  },
};

export async function extractWordText(source: LocalImportSource) {
  if (getSourceExtension(source.name) === 'doc') {
    throw new ZipParseError('Binary .doc files are not supported for text extraction.');
  }

  const document = await readWordDocument(source);
  const tableText = descendantsByLocalName(document, 'tbl')
    .flatMap((table) => readWordTable(table).map((row) => row.join(' ')))
    .join('\n');

  return [readWordParagraphText(document), tableText]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readWordDocument(source: LocalImportSource) {
  const bytes = await readSourceBytes(source);
  const entries = await readZipEntries(bytes);
  const documentXml = getZipText(entries, 'word/document.xml');

  if (!documentXml) {
    throw new ZipParseError('Word document XML was not found.');
  }

  return parseXml(documentXml, 'Word document');
}

function readWordTable(table: Element) {
  return directChildrenByLocalName(table, 'tr').map((row) =>
    directChildrenByLocalName(row, 'tc').map((cell) => readWordCellText(cell))
  );
}

function readWordCellText(cell: Element) {
  return descendantsByLocalName(cell, 't')
    .map((text) => text.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readWordParagraphText(document: Document) {
  return descendantsByLocalName(document, 'p')
    .map((paragraph) =>
      descendantsByLocalName(paragraph, 't')
        .map((text) => text.textContent ?? '')
        .join('')
        .trim()
    )
    .filter(Boolean)
    .join('\n');
}
