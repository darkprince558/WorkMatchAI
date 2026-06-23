export const DOCUMENT_TEXT_CHUNKER_VERSION = 'deterministic-text-v1';

export interface DocumentChunkingOptions {
  maxChunkChars?: number;
  overlapChars?: number;
  minChunkChars?: number;
}

export interface ResolvedDocumentChunkingOptions {
  maxChunkChars: number;
  overlapChars: number;
  minChunkChars: number;
}

export interface DocumentTextChunk {
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
  tokenCount: number;
  contentHash: string;
}

export interface BuildDocumentChunkRowsInput {
  organizationId: string;
  sourceDocumentId: string;
  text: string;
  pageNumber?: number;
  sectionTitle?: string;
  parserConfidence?: number;
  metadata?: Record<string, unknown>;
  chunking?: DocumentChunkingOptions;
}

export interface DocumentChunkRowDraft {
  organization_id: string;
  source_document_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  content_char_start: number;
  content_char_end: number;
  token_count: number;
  page_number: number | null;
  section_title: string | null;
  parser_confidence: number | null;
  metadata: Record<string, unknown>;
}

export const DEFAULT_DOCUMENT_CHUNKING_OPTIONS: ResolvedDocumentChunkingOptions = {
  maxChunkChars: 1200,
  overlapChars: 160,
  minChunkChars: 240,
};

const MAX_REASONABLE_CHUNK_CHARS = 12_000;
const WORD_BOUNDARY_SCAN_DISTANCE = 48;

export function normalizeDocumentText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function resolveDocumentChunkingOptions(options: DocumentChunkingOptions = {}): ResolvedDocumentChunkingOptions {
  const requestedMaxChunkChars = normalizePositiveInteger(
    options.maxChunkChars,
    DEFAULT_DOCUMENT_CHUNKING_OPTIONS.maxChunkChars,
    'maxChunkChars'
  );
  const maxChunkChars = Math.min(requestedMaxChunkChars, MAX_REASONABLE_CHUNK_CHARS);
  const minChunkChars = normalizePositiveInteger(
    options.minChunkChars,
    Math.min(DEFAULT_DOCUMENT_CHUNKING_OPTIONS.minChunkChars, maxChunkChars),
    'minChunkChars'
  );
  const overlapChars = normalizeNonNegativeInteger(
    options.overlapChars,
    Math.min(DEFAULT_DOCUMENT_CHUNKING_OPTIONS.overlapChars, Math.max(0, maxChunkChars - 1)),
    'overlapChars'
  );

  return {
    maxChunkChars,
    overlapChars: Math.min(overlapChars, Math.max(0, maxChunkChars - 1)),
    minChunkChars: Math.min(minChunkChars, maxChunkChars),
  };
}

export function chunkDocumentText(text: string, options: DocumentChunkingOptions = {}): DocumentTextChunk[] {
  const normalizedText = normalizeDocumentText(text);
  if (!normalizedText) return [];

  const resolvedOptions = resolveDocumentChunkingOptions(options);
  const chunks: DocumentTextChunk[] = [];
  let nextStart = skipWhitespaceForward(normalizedText, 0);

  while (nextStart < normalizedText.length) {
    const rawEnd = chooseChunkEnd(normalizedText, nextStart, resolvedOptions);
    const range = trimRange(normalizedText, nextStart, rawEnd);
    if (range.end <= range.start) break;

    const content = normalizedText.slice(range.start, range.end);
    chunks.push({
      chunkIndex: chunks.length,
      content,
      charStart: range.start,
      charEnd: range.end,
      tokenCount: estimateTokenCount(content),
      contentHash: stableContentHash(content),
    });

    if (range.end >= normalizedText.length) break;

    const overlapStart = chooseOverlapStart(normalizedText, range.start, range.end, resolvedOptions.overlapChars);
    nextStart = overlapStart <= range.start ? range.end : overlapStart;
  }

  return chunks;
}

export function buildDocumentChunkRows(input: BuildDocumentChunkRowsInput): DocumentChunkRowDraft[] {
  const parserConfidence = normalizeParserConfidence(input.parserConfidence);
  const normalizedText = normalizeDocumentText(input.text);
  const sourceTextHash = stableContentHash(normalizedText);
  const chunking = resolveDocumentChunkingOptions(input.chunking);

  return chunkDocumentText(normalizedText, chunking).map((chunk) => ({
    organization_id: input.organizationId,
    source_document_id: input.sourceDocumentId,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    content_hash: chunk.contentHash,
    content_char_start: chunk.charStart,
    content_char_end: chunk.charEnd,
    token_count: chunk.tokenCount,
    page_number: input.pageNumber ?? null,
    section_title: input.sectionTitle ?? null,
    parser_confidence: parserConfidence,
    metadata: {
      ...(input.metadata ?? {}),
      chunker: DOCUMENT_TEXT_CHUNKER_VERSION,
      sourceTextHash,
      maxChunkChars: chunking.maxChunkChars,
      overlapChars: chunking.overlapChars,
    },
  }));
}

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const wordCount = trimmed.split(/\s+/).length;
  const nonWhitespaceChars = trimmed.replace(/\s/g, '').length;
  return Math.max(wordCount, Math.ceil(nonWhitespaceChars / 4));
}

export function stableContentHash(text: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function chooseChunkEnd(text: string, start: number, options: ResolvedDocumentChunkingOptions): number {
  const hardEnd = Math.min(text.length, start + options.maxChunkChars);
  if (hardEnd >= text.length) return text.length;

  const minEnd = Math.min(hardEnd, start + options.minChunkChars);
  return (
    findLastParagraphBreak(text, minEnd, hardEnd) ??
    findLastSentenceBreak(text, minEnd, hardEnd) ??
    findLastWhitespaceBreak(text, minEnd, hardEnd) ??
    hardEnd
  );
}

function findLastParagraphBreak(text: string, minEnd: number, hardEnd: number): number | undefined {
  const boundary = text.lastIndexOf('\n\n', hardEnd);
  if (boundary < minEnd) return undefined;
  return boundary;
}

function findLastSentenceBreak(text: string, minEnd: number, hardEnd: number): number | undefined {
  for (let index = hardEnd - 1; index >= minEnd; index -= 1) {
    const char = text[index];
    const nextChar = text[index + 1];
    if ((char === '.' || char === '!' || char === '?') && (!nextChar || /\s/.test(nextChar))) {
      return index + 1;
    }
  }

  return undefined;
}

function findLastWhitespaceBreak(text: string, minEnd: number, hardEnd: number): number | undefined {
  for (let index = hardEnd - 1; index >= minEnd; index -= 1) {
    if (/\s/.test(text[index])) return index;
  }

  return undefined;
}

function chooseOverlapStart(text: string, chunkStart: number, chunkEnd: number, overlapChars: number): number {
  if (overlapChars <= 0) return skipWhitespaceForward(text, chunkEnd);

  const target = Math.max(chunkStart + 1, chunkEnd - overlapChars);
  const backwardBoundary = findPreviousWhitespaceBoundary(text, chunkStart + 1, target);
  if (backwardBoundary !== undefined) return skipWhitespaceForward(text, backwardBoundary);

  const forwardBoundary = findNextWhitespaceBoundary(text, target, Math.min(chunkEnd, target + WORD_BOUNDARY_SCAN_DISTANCE));
  if (forwardBoundary !== undefined) return skipWhitespaceForward(text, forwardBoundary);

  return target;
}

function findPreviousWhitespaceBoundary(text: string, minStart: number, target: number): number | undefined {
  for (let index = target; index >= minStart; index -= 1) {
    if (/\s/.test(text[index])) return index;
  }

  return undefined;
}

function findNextWhitespaceBoundary(text: string, target: number, maxEnd: number): number | undefined {
  for (let index = target; index < maxEnd; index += 1) {
    if (/\s/.test(text[index])) return index;
  }

  return undefined;
}

function trimRange(text: string, start: number, end: number) {
  let trimmedStart = start;
  let trimmedEnd = end;

  while (trimmedStart < trimmedEnd && /\s/.test(text[trimmedStart])) {
    trimmedStart += 1;
  }

  while (trimmedEnd > trimmedStart && /\s/.test(text[trimmedEnd - 1])) {
    trimmedEnd -= 1;
  }

  return { start: trimmedStart, end: trimmedEnd };
}

function skipWhitespaceForward(text: string, start: number): number {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }
  return index;
}

function normalizePositiveInteger(value: number | undefined, fallback: number, optionName: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError(`${optionName} must be a positive finite number.`);
  }
  return Math.floor(value);
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number, optionName: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${optionName} must be a non-negative finite number.`);
  }
  return Math.floor(value);
}

function normalizeParserConfidence(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('parserConfidence must be between 0 and 1.');
  }
  return value;
}
