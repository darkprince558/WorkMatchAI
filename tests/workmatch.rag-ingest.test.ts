import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import type { RagDocumentIngestResult, RagDocumentIngestRows } from '../lib/rag/ingest';

const require = createRequire(import.meta.url);
const { buildRagDocumentIngestRows, ingestRagDocument } = require('../lib/rag/ingest.ts') as typeof import('../lib/rag/ingest');
const { normalizeDocumentText, stableContentHash } = require('../lib/rag/text-chunking.ts') as typeof import('../lib/rag/text-chunking');

describe('RAG source document ingest', () => {
  it('builds tenant-scoped source document and chunk rows without embeddings', () => {
    const text = [
      'Project Atlas needs React, TypeScript, and AI intake support.',
      'The delivery notes mention Supabase, manager review, and staffing constraints.',
      'A follow-up section captures change management and rollout dependencies.',
    ].join('\n\n');

    const rows = buildRagDocumentIngestRows({
      organizationId: 'org-a',
      sourceDocumentId: 'doc-a',
      text,
      fileName: 'atlas-brief.pdf',
      mimeType: 'application/pdf',
      targetType: 'task',
      targetId: 'task-atlas',
      parser: 'unit-parser',
      parserVersion: '2026-06',
      parserConfidence: 0.91,
      metadata: { intake: 'unit-test' },
      chunking: { maxChunkChars: 110, minChunkChars: 50, overlapChars: 20 },
    });

    assert.equal(rows.sourceDocument.id, 'doc-a');
    assert.equal(rows.sourceDocument.organization_id, 'org-a');
    assert.equal(rows.sourceDocument.file_name, 'atlas-brief.pdf');
    assert.equal(rows.sourceDocument.target_type, 'task');
    assert.equal(rows.sourceDocument.target_id, 'task-atlas');
    assert.equal(rows.sourceDocument.status, 'chunked');
    assert.equal(rows.sourceDocument.chunk_count, rows.chunks.length);
    assert.equal(rows.sourceDocument.content_hash, stableContentHash(normalizeDocumentText(text)));
    assert.equal(rows.sourceDocument.metadata.retrieval, 'postgres_full_text');
    assert.ok(rows.chunks.length > 1);

    rows.chunks.forEach((chunk, index) => {
      assert.equal(chunk.organization_id, 'org-a');
      assert.equal(chunk.source_document_id, 'doc-a');
      assert.equal(chunk.chunk_index, index);
      assert.equal(chunk.embedding_status, 'skipped');
      assert.equal(chunk.metadata.intake, 'unit-test');
      assert.equal(chunk.metadata.retrieval, 'postgres_full_text');
      assert.equal('embedding' in chunk, false);
      assert.ok(chunk.content.length > 0);
    });
  });

  it('hands generated rows to the configured writer and returns persisted rows', async () => {
    const writes: RagDocumentIngestRows[] = [];
    const writer = async (rows: RagDocumentIngestRows): Promise<RagDocumentIngestResult> => {
      writes.push(rows);
      return {
        sourceDocument: {
          ...rows.sourceDocument,
          created_at: '2026-06-23T12:00:00.000Z',
          updated_at: '2026-06-23T12:00:00.000Z',
        },
        chunks: rows.chunks.map((chunk, index) => ({
          ...chunk,
          id: `chunk-${index}`,
          created_at: '2026-06-23T12:00:00.000Z',
          updated_at: '2026-06-23T12:00:00.000Z',
        })),
      };
    };

    const result = await ingestRagDocument(
      {
        organizationId: 'org-writer',
        sourceDocumentId: 'doc-writer',
        text: 'React delivery notes for tenant-scoped retrieval.',
        fileName: 'writer-note.txt',
        sourceType: 'manual',
        createdByUserId: 'manager-1',
      },
      { writer }
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0].sourceDocument.organization_id, 'org-writer');
    assert.equal(writes[0].sourceDocument.created_by_user_id, 'manager-1');
    assert.equal(result.sourceDocument.id, 'doc-writer');
    assert.equal(result.chunks[0].id, 'chunk-0');
    assert.equal(result.chunks[0].source_document_id, 'doc-writer');
  });
});
