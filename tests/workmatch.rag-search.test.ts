import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import type { RagSearchCandidate, RagSearchSourceDocument } from '../lib/rag/search';

const require = createRequire(import.meta.url);
const {
  MAX_RAG_SEARCH_LIMIT,
  createInMemoryRagSearchQuery,
  normalizeSearchInput,
  searchRagDocumentChunks,
} = require('../lib/rag/search.ts') as typeof import('../lib/rag/search');

describe('RAG source document search', () => {
  it('filters candidates by tenant even when a query abstraction leaks another organization', async () => {
    const results = await searchRagDocumentChunks(
      {
        organizationId: 'org-a',
        query: 'React',
      },
      {
        queryDocumentChunks: async () => [
          candidate({
            organization_id: 'org-b',
            source_document_id: 'doc-b',
            content: 'React plan from another tenant should never be returned.',
            rank: 99,
            source_document: sourceDocument({ organization_id: 'org-b', id: 'doc-b' }),
          }),
          candidate({
            organization_id: 'org-a',
            source_document_id: 'doc-a',
            content: 'React staffing plan for the requested tenant.',
            rank: 1,
            source_document: sourceDocument({ organization_id: 'org-a', id: 'doc-a' }),
          }),
        ],
      }
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].sourceDocumentId, 'doc-a');
    assert.equal(results[0].content, 'React staffing plan for the requested tenant.');
  });

  it('supports source and target filters through an in-memory query abstraction', async () => {
    const queryDocumentChunks = createInMemoryRagSearchQuery([
      candidate({
        source_document_id: 'doc-a',
        content: 'React delivery plan with one mention.',
        source_document: sourceDocument({ id: 'doc-a', target_type: 'task', target_id: 'task-1', file_name: 'a.pdf' }),
      }),
      candidate({
        source_document_id: 'doc-b',
        content: 'React employee resume should be filtered by target type.',
        source_document: sourceDocument({ id: 'doc-b', target_type: 'employee', target_id: 'emp-1', file_name: 'b.pdf' }),
      }),
      candidate({
        source_document_id: 'doc-c',
        content: 'React React delivery plan with stronger lexical evidence.',
        source_document: sourceDocument({ id: 'doc-c', target_type: 'task', target_id: 'task-1', file_name: 'c.pdf' }),
      }),
    ]);

    const results = await searchRagDocumentChunks(
      {
        organizationId: 'org-a',
        query: 'React',
        sourceDocumentIds: ['doc-a', 'doc-b', 'doc-c'],
        targetType: 'task',
        targetId: 'task-1',
        limit: 5,
      },
      { queryDocumentChunks }
    );

    assert.deepEqual(
      results.map((result) => result.sourceDocumentId),
      ['doc-c', 'doc-a']
    );
    assert.equal(results[0].sourceDocument?.fileName, 'c.pdf');
    assert.ok(results[0].score > results[1].score);
  });

  it('normalizes request limits and source document IDs', () => {
    const request = normalizeSearchInput({
      organizationId: ' org-a ',
      query: ' SQL reporting ',
      limit: 1000,
      sourceDocumentIds: [' doc-a ', 'doc-a', '', 'doc-b'],
    });

    assert.equal(request.organizationId, 'org-a');
    assert.equal(request.query, 'SQL reporting');
    assert.equal(request.limit, MAX_RAG_SEARCH_LIMIT);
    assert.deepEqual(request.sourceDocumentIds, ['doc-a', 'doc-b']);
  });
});

function candidate(overrides: Partial<RagSearchCandidate> = {}): RagSearchCandidate {
  return {
    organization_id: 'org-a',
    source_document_id: 'doc-a',
    chunk_index: 0,
    content: 'React delivery plan.',
    content_hash: 'hash-a',
    content_char_start: 0,
    content_char_end: 20,
    token_count: 4,
    page_number: null,
    section_title: null,
    parser_confidence: null,
    metadata: {},
    source_document: sourceDocument({ id: overrides.source_document_id ?? 'doc-a' }),
    ...overrides,
  };
}

function sourceDocument(overrides: Partial<RagSearchSourceDocument> = {}): RagSearchSourceDocument {
  return {
    id: 'doc-a',
    organization_id: 'org-a',
    title: null,
    file_name: 'brief.pdf',
    source_type: 'upload',
    storage_path: null,
    source_uri: null,
    target_type: 'task',
    target_id: 'task-1',
    metadata: {},
    ...overrides,
  };
}
