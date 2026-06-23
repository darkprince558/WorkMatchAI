import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const {
  DOCUMENT_TEXT_CHUNKER_VERSION,
  buildDocumentChunkRows,
  chunkDocumentText,
  normalizeDocumentText,
  stableContentHash,
} = require('../lib/rag/text-chunking.ts') as typeof import('../lib/rag/text-chunking');

describe('RAG document text chunking', () => {
  it('normalizes uploaded document text before creating a stable single chunk', () => {
    const source = '\uFEFFProject Brief\r\n\r\n\r\nNeeds React.  \r\nNeeds AI.';
    const normalized = normalizeDocumentText(source);
    const chunks = chunkDocumentText(source, { maxChunkChars: 500 });

    assert.equal(normalized, 'Project Brief\n\nNeeds React.\nNeeds AI.');
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].chunkIndex, 0);
    assert.equal(chunks[0].content, normalized);
    assert.equal(chunks[0].charStart, 0);
    assert.equal(chunks[0].charEnd, normalized.length);
    assert.equal(chunks[0].contentHash, stableContentHash(normalized));
    assert.ok(chunks[0].tokenCount > 0);
  });

  it('creates deterministic overlapping chunks using natural boundaries when available', () => {
    const text = Array.from(
      { length: 8 },
      (_, index) =>
        `Section ${index + 1}. This staffing note explains delivery needs, required skills, availability constraints, and manager review steps. Closing sentence ${index + 1}.`
    ).join('\n\n');
    const options = { maxChunkChars: 260, minChunkChars: 120, overlapChars: 50 };
    const chunks = chunkDocumentText(text, options);

    assert.deepEqual(chunks, chunkDocumentText(text, options));
    assert.ok(chunks.length > 1);

    chunks.forEach((chunk, index) => {
      assert.equal(chunk.chunkIndex, index);
      assert.ok(chunk.content.length <= options.maxChunkChars);
      assert.ok(chunk.charStart < chunk.charEnd);
      assert.equal(chunk.contentHash, stableContentHash(chunk.content));

      if (index > 0) {
        assert.ok(chunk.charStart < chunks[index - 1].charEnd);
        assert.ok(chunk.charEnd > chunks[index - 1].charEnd);
      }
    });

    assert.match(chunks[0].content, /[.!?]$/);
  });

  it('splits oversized unbroken text without empty chunks or overflow', () => {
    const text = 'x'.repeat(205);
    const chunks = chunkDocumentText(text, { maxChunkChars: 80, minChunkChars: 20, overlapChars: 10 });

    assert.ok(chunks.length > 2);
    assert.equal(chunks[0].charStart, 0);
    assert.equal(chunks.at(-1)?.charEnd, text.length);
    assert.ok(chunks.every((chunk) => chunk.content.length <= 80));
    assert.ok(chunks.every((chunk) => chunk.content.length > 0));
  });

  it('builds tenant-scoped database row drafts without embedding calls', () => {
    const rows = buildDocumentChunkRows({
      organizationId: 'org-1',
      sourceDocumentId: 'doc-1',
      text: [
        'Alpha project needs React and AI delivery support.',
        'Beta project needs SQL reporting and careful staffing review.',
        'Gamma project needs change-management notes captured for retrieval.',
      ].join('\n\n'),
      pageNumber: 2,
      sectionTitle: 'Scope',
      parserConfidence: 0.92,
      metadata: { source: 'unit-test' },
      chunking: { maxChunkChars: 95, minChunkChars: 45, overlapChars: 18 },
    });

    assert.ok(rows.length > 1);
    assert.deepEqual(
      rows.map((row) => row.chunk_index),
      rows.map((_, index) => index)
    );
    assert.equal(rows[0].organization_id, 'org-1');
    assert.equal(rows[0].source_document_id, 'doc-1');
    assert.equal(rows[0].page_number, 2);
    assert.equal(rows[0].section_title, 'Scope');
    assert.equal(rows[0].parser_confidence, 0.92);
    assert.equal(rows[0].metadata.source, 'unit-test');
    assert.equal(rows[0].metadata.chunker, DOCUMENT_TEXT_CHUNKER_VERSION);
    assert.equal(rows[0].content_hash, stableContentHash(rows[0].content));
  });
});
