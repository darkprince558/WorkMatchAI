import { ensureOrganization } from '@/lib/db/organizations';
import { eqFilter, isSupabasePersistenceConfigured, supabaseRestRequest } from '@/lib/db/supabase-rest';
import {
  buildDocumentChunkRows,
  type DocumentChunkingOptions,
  type DocumentChunkRowDraft,
  normalizeDocumentText,
  stableContentHash,
} from './text-chunking';

export type RagSourceType = 'upload' | 'google_drive' | 'sharepoint' | 'notion' | 'manual' | 'import' | 'sample_data' | 'api';
export type RagTargetType = 'employee' | 'task' | 'import' | 'organization';
export type RagDocumentStatus = 'uploaded' | 'parsed' | 'chunked' | 'embedding_pending' | 'embedded' | 'failed';
export type RagEmbeddingStatus = 'pending' | 'embedded' | 'skipped' | 'failed';

export interface RagSourceDocumentInsert {
  id: string;
  organization_id: string;
  import_id: string | null;
  imported_record_id: string | null;
  source_type: RagSourceType;
  title: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  source_uri: string | null;
  target_type: RagTargetType | null;
  target_id: string | null;
  status: RagDocumentStatus;
  parser: string | null;
  parser_version: string | null;
  parser_confidence: number | null;
  content_hash: string;
  chunk_count: number;
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  processed_at: string | null;
}

export interface RagSourceDocumentRow extends RagSourceDocumentInsert {
  created_at?: string;
  updated_at?: string;
}

export interface RagDocumentChunkInsert extends DocumentChunkRowDraft {
  embedding_status: RagEmbeddingStatus;
}

export interface RagDocumentChunkRow extends RagDocumentChunkInsert {
  id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BuildRagDocumentIngestRowsInput {
  organizationId: string;
  text: string;
  sourceDocumentId?: string;
  importId?: string;
  importedRecordId?: string;
  sourceType?: RagSourceType;
  title?: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  storagePath?: string;
  sourceUri?: string;
  targetType?: RagTargetType;
  targetId?: string;
  parser?: string;
  parserVersion?: string;
  parserConfidence?: number;
  metadata?: Record<string, unknown>;
  createdByUserId?: string;
  updatedByUserId?: string;
  processedAt?: string;
  chunking?: DocumentChunkingOptions;
}

export interface RagDocumentIngestRows {
  sourceDocument: RagSourceDocumentInsert;
  chunks: RagDocumentChunkInsert[];
}

export interface RagDocumentIngestResult {
  sourceDocument: RagSourceDocumentRow;
  chunks: RagDocumentChunkRow[];
}

export type RagDocumentIngestWriter = (rows: RagDocumentIngestRows) => Promise<RagDocumentIngestResult>;

export interface IngestRagDocumentOptions {
  writer?: RagDocumentIngestWriter;
}

export function buildRagDocumentIngestRows(input: BuildRagDocumentIngestRowsInput): RagDocumentIngestRows {
  const organizationId = boundedRequiredString(input.organizationId, 'organizationId', 128);
  const fileName = boundedRequiredString(input.fileName, 'fileName', 512);
  const sourceDocumentId = boundedRequiredString(input.sourceDocumentId ?? crypto.randomUUID(), 'sourceDocumentId', 128);
  const parserConfidence = normalizeParserConfidence(input.parserConfidence);
  const normalizedText = normalizeDocumentText(input.text);
  const contentHash = stableContentHash(normalizedText);
  const baseMetadata = jsonMetadata(input.metadata);
  const chunkRows = buildDocumentChunkRows({
    organizationId,
    sourceDocumentId,
    text: normalizedText,
    parserConfidence: parserConfidence ?? undefined,
    metadata: {
      ...baseMetadata,
      retrieval: 'postgres_full_text',
    },
    chunking: input.chunking,
  });

  return {
    sourceDocument: {
      id: sourceDocumentId,
      organization_id: organizationId,
      import_id: optionalBoundedString(input.importId, 128),
      imported_record_id: optionalBoundedString(input.importedRecordId, 128),
      source_type: input.sourceType ?? 'upload',
      title: optionalBoundedString(input.title, 512),
      file_name: fileName,
      mime_type: optionalBoundedString(input.mimeType, 255),
      size_bytes: normalizeSizeBytes(input.sizeBytes),
      storage_path: optionalBoundedString(input.storagePath, 1024),
      source_uri: optionalBoundedString(input.sourceUri, 2048),
      target_type: input.targetType ?? null,
      target_id: optionalBoundedString(input.targetId, 128),
      status: chunkRows.length ? 'chunked' : 'parsed',
      parser: optionalBoundedString(input.parser, 120),
      parser_version: optionalBoundedString(input.parserVersion, 120),
      parser_confidence: parserConfidence,
      content_hash: contentHash,
      chunk_count: chunkRows.length,
      metadata: {
        ...baseMetadata,
        textLength: normalizedText.length,
        retrieval: 'postgres_full_text',
      },
      error_message: null,
      created_by_user_id: optionalBoundedString(input.createdByUserId, 128),
      updated_by_user_id: optionalBoundedString(input.updatedByUserId, 128),
      processed_at: input.processedAt ?? new Date().toISOString(),
    },
    chunks: chunkRows.map((row) => ({
      ...row,
      embedding_status: 'skipped',
    })),
  };
}

export async function ingestRagDocument(
  input: BuildRagDocumentIngestRowsInput,
  options: IngestRagDocumentOptions = {}
): Promise<RagDocumentIngestResult> {
  const rows = buildRagDocumentIngestRows(input);
  const writer = options.writer ?? writeRagDocumentToSupabase;
  return writer(rows);
}

export async function writeRagDocumentToSupabase(rows: RagDocumentIngestRows): Promise<RagDocumentIngestResult> {
  if (!isSupabasePersistenceConfigured()) {
    throw new Error('Supabase persistence is required to ingest RAG source documents.');
  }

  await ensureOrganization(rows.sourceDocument.organization_id);

  const sourceRows = await supabaseRestRequest<RagSourceDocumentRow[]>('source_documents?on_conflict=organization_id,id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify(rows.sourceDocument),
  });
  const sourceDocument = sourceRows[0] ?? rows.sourceDocument;

  await supabaseRestRequest(
    `document_chunks?${eqFilter('organization_id', rows.sourceDocument.organization_id)}&${eqFilter('source_document_id', rows.sourceDocument.id)}`,
    {
      method: 'DELETE',
      prefer: 'return=minimal',
    }
  );

  const chunks = rows.chunks.length
    ? await supabaseRestRequest<RagDocumentChunkRow[]>('document_chunks', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify(rows.chunks),
      })
    : [];

  return {
    sourceDocument,
    chunks,
  };
}

function boundedRequiredString(value: string, field: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new RangeError(`${field} is required.`);
  if (normalized.length > maxLength) return normalized.slice(0, maxLength);
  return normalized;
}

function optionalBoundedString(value: string | undefined, maxLength: number) {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) return normalized.slice(0, maxLength);
  return normalized;
}

function normalizeParserConfidence(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('parserConfidence must be between 0 and 1.');
  }
  return value;
}

function normalizeSizeBytes(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) throw new RangeError('sizeBytes must be a non-negative finite number.');
  return Math.floor(value);
}

function jsonMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
