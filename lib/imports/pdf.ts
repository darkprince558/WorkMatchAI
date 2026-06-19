import { createFallbackImportResult } from './fallbacks';
import { readSourceBytes } from './readers';
import { delimitedTextToReviewRecords } from './table-records';
import type { LocalImportAdapter, LocalImportResult, LocalImportSource, ResolvedLocalImportOptions } from './types';
import { inflate } from './zip';

export const pdfImportAdapter: LocalImportAdapter = {
  format: 'pdf',
  async parse(source: LocalImportSource, options: ResolvedLocalImportOptions): Promise<LocalImportResult> {
    try {
      const bytes = await readSourceBytes(source);
      const text = await extractPdfText(bytes);
      const records = delimitedTextToReviewRecords(text, {
        sourceFile: source.name,
        target: options.target,
      });

      return {
        sourceFile: source.name,
        format: 'pdf',
        target: options.target,
        status: records.length ? 'parsed' : 'fallback',
        records,
        warnings: records.length
          ? []
          : [
              text
                ? 'PDF text was extracted, but no importable delimited employee/task rows were detected.'
                : 'No selectable PDF text was extracted. Scanned PDFs need OCR before WorkMatch can import them.',
            ],
        dependencyNotes: [],
      };
    } catch (error) {
      return createFallbackImportResult({
        sourceFile: source.name,
        format: 'pdf',
        target: options.target,
        reason: error instanceof Error ? error.message : 'PDF parsing failed',
        fallback: 'Use a text PDF with comma, pipe, tab, or wide-space separated rows, or export the table to CSV.',
        status: 'fallback',
      });
    }
  },
};

export async function extractPdfText(bytes: Uint8Array) {
  const source = bytesToLatin1(bytes);
  const streamTexts: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const streamIndex = source.indexOf('stream', cursor);
    if (streamIndex === -1) break;

    const endStreamIndex = source.indexOf('endstream', streamIndex);
    if (endStreamIndex === -1) break;

    const dictStart = source.lastIndexOf('<<', streamIndex);
    const dictEnd = source.lastIndexOf('>>', streamIndex);
    const dictionary = dictStart !== -1 && dictEnd !== -1 && dictEnd > dictStart ? source.slice(dictStart, dictEnd + 2) : '';
    const dataStart = skipPdfStreamLineEnding(source, streamIndex + 'stream'.length);
    const data = bytes.subarray(dataStart, endStreamIndex);
    const decoded = await decodePdfStream(data, dictionary).catch(() => undefined);

    if (decoded) streamTexts.push(extractTextOperators(bytesToLatin1(decoded)));
    cursor = endStreamIndex + 'endstream'.length;
  }

  return streamTexts
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

async function decodePdfStream(data: Uint8Array, dictionary: string) {
  if (/\/Filter\s*(?:\/FlateDecode|\[[^\]]*\/FlateDecode)/.test(dictionary)) {
    return inflate(data, 'deflate').catch(() => inflate(data, 'deflate-raw'));
  }

  if (/\/Filter\s*\//.test(dictionary)) return undefined;
  return data;
}

function extractTextOperators(content: string) {
  const blocks = content.match(/BT[\s\S]*?ET/g) ?? [];
  const text: string[] = [];

  blocks.forEach((block) => {
    const operatorMatches = block.match(/\[[\s\S]*?\]\s*TJ|\([\s\S]*?\)\s*(?:Tj|'|")/g) ?? [];
    operatorMatches.forEach((operator) => {
      const strings = extractPdfLiteralStrings(operator);
      if (strings.length) text.push(strings.join(''));
    });
  });

  return text.join('\n');
}

function extractPdfLiteralStrings(value: string) {
  const strings: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '(') continue;

    let depth = 1;
    let current = '';
    index += 1;

    while (index < value.length && depth > 0) {
      const char = value[index];
      const next = value[index + 1];

      if (char === '\\') {
        const decoded = decodePdfEscape(next, value.slice(index + 1, index + 4));
        current += decoded.value;
        index += decoded.consumed;
      } else if (char === '(') {
        depth += 1;
        current += char;
      } else if (char === ')') {
        depth -= 1;
        if (depth > 0) current += char;
      } else {
        current += char;
      }

      index += 1;
    }

    strings.push(current);
  }

  return strings;
}

function decodePdfEscape(next: string | undefined, nextThree: string) {
  if (!next) return { value: '', consumed: 1 };

  if (/[0-7]/.test(next)) {
    const octal = nextThree.match(/^[0-7]{1,3}/)?.[0] ?? next;
    return {
      value: String.fromCharCode(parseInt(octal, 8)),
      consumed: octal.length,
    };
  }

  const escapes: Record<string, string> = {
    n: '\n',
    r: '\r',
    t: '\t',
    b: '\b',
    f: '\f',
    '\\': '\\',
    '(': '(',
    ')': ')',
  };

  return {
    value: escapes[next] ?? next,
    consumed: 1,
  };
}

function skipPdfStreamLineEnding(source: string, index: number) {
  if (source[index] === '\r' && source[index + 1] === '\n') return index + 2;
  if (source[index] === '\r' || source[index] === '\n') return index + 1;
  return index;
}

function bytesToLatin1(bytes: Uint8Array) {
  const chunkSize = 8192;
  let value = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    value += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return value;
}
