import { eqFilter, isSupabasePersistenceConfigured, supabaseRestRequest } from '@/lib/db/supabase-rest';
import type { RagSourceType, RagTargetType } from './ingest';

export const DEFAULT_RAG_SEARCH_LIMIT = 8;
export const MAX_RAG_SEARCH_LIMIT = 25;

export interface RagSearchInput {
  organizationId: string;
  query: string;
  limit?: number;
  sourceDocumentIds?: string[];
  targetType?: RagTargetType;
  targetId?: string;
}

export interface RagSearchRequest {
  organizationId: string;
  query: string;
  limit: number;
  sourceDocumentIds?: string[];
  targetType?: RagTargetType;
  targetId?: string;
}

export interface RagSearchCandidate {
  id?: string;
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
  rank?: number;
  source_document?: RagSearchSourceDocument | null;
}

export interface RagSearchSourceDocument {
  id: string;
  organization_id: string;
  title: string | null;
  file_name: string;
  source_type: RagSourceType;
  storage_path: string | null;
  source_uri: string | null;
  target_type: RagTargetType | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
}

export interface RagSearchResult {
  chunkId?: string;
  sourceDocumentId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  contentCharStart: number;
  contentCharEnd: number;
  tokenCount: number;
  pageNumber?: number;
  sectionTitle?: string;
  parserConfidence?: number;
  metadata: Record<string, unknown>;
  score: number;
  sourceDocument?: {
    id: string;
    title?: string;
    fileName: string;
    sourceType: RagSourceType;
    storagePath?: string;
    sourceUri?: string;
    targetType?: RagTargetType;
    targetId?: string;
    metadata: Record<string, unknown>;
  };
}

export type RagSearchQuery = (request: RagSearchRequest) => Promise<RagSearchCandidate[]>;

export interface SearchRagDocumentChunksOptions {
  queryDocumentChunks?: RagSearchQuery;
}

type SupabaseChunkRow = Omit<RagSearchCandidate, 'source_document' | 'rank'>;

export async function searchRagDocumentChunks(
  input: RagSearchInput,
  options: SearchRagDocumentChunksOptions = {}
): Promise<RagSearchResult[]> {
  const request = normalizeSearchInput(input);
  const queryDocumentChunks = options.queryDocumentChunks ?? queryRagDocumentChunksFromSupabase;
  const candidates = await queryDocumentChunks(request);
  const sourceDocumentIds = new Set(request.sourceDocumentIds ?? []);

  return candidates
    .filter((candidate) => candidate.organization_id === request.organizationId)
    .filter((candidate) => !sourceDocumentIds.size || sourceDocumentIds.has(candidate.source_document_id))
    .filter((candidate) => !request.targetType || candidate.source_document?.target_type === request.targetType)
    .filter((candidate) => !request.targetId || candidate.source_document?.target_id === request.targetId)
    .map((candidate) => toSearchResult(candidate, request.query))
    .sort(compareSearchResults)
    .slice(0, request.limit);
}

export function createInMemoryRagSearchQuery(candidates: RagSearchCandidate[]): RagSearchQuery {
  return async (request) => {
    const terms = tokenizeQuery(request.query);
    const sourceDocumentIds = new Set(request.sourceDocumentIds ?? []);

    return candidates
      .filter((candidate) => candidate.organization_id === request.organizationId)
      .filter((candidate) => !sourceDocumentIds.size || sourceDocumentIds.has(candidate.source_document_id))
      .filter((candidate) => !request.targetType || candidate.source_document?.target_type === request.targetType)
      .filter((candidate) => !request.targetId || candidate.source_document?.target_id === request.targetId)
      .filter((candidate) => terms.every((term) => candidate.content.toLowerCase().includes(term)))
      .slice(0, request.limit * 4);
  };
}

export function normalizeSearchInput(input: RagSearchInput): RagSearchRequest {
  const organizationId = boundedRequiredString(input.organizationId, 'organizationId', 128);
  const query = boundedRequiredString(input.query, 'query', 512);
  const limit = normalizeLimit(input.limit);
  const sourceDocumentIds = normalizeSourceDocumentIds(input.sourceDocumentIds);

  return {
    organizationId,
    query,
    limit,
    sourceDocumentIds,
    targetType: input.targetType,
    targetId: optionalBoundedString(input.targetId, 128),
  };
}

export async function queryRagDocumentChunksFromSupabase(request: RagSearchRequest): Promise<RagSearchCandidate[]> {
  if (!isSupabasePersistenceConfigured()) return [];

  const sourceDocuments = await listSupabaseSourceDocuments(request);
  const shouldScopeBySourceDocuments = Boolean(request.sourceDocumentIds?.length || request.targetType || request.targetId);
  const sourceDocumentIds = shouldScopeBySourceDocuments ? sourceDocuments.map((document) => document.id) : undefined;

  if (shouldScopeBySourceDocuments && !sourceDocumentIds?.length) return [];

  const filters = [
    eqFilter('organization_id', request.organizationId),
    `search_vector=wfts.${encodeURIComponent(request.query)}`,
    'select=id,organization_id,source_document_id,chunk_index,content,content_hash,content_char_start,content_char_end,token_count,page_number,section_title,parser_confidence,metadata',
    `limit=${Math.min(request.limit * 4, 100)}`,
  ];
  if (sourceDocumentIds?.length) {
    filters.push(`source_document_id=in.(${sourceDocumentIds.map(encodePostgrestListItem).join(',')})`);
  }

  const chunks = await supabaseRestRequest<SupabaseChunkRow[]>(`document_chunks?${filters.join('&')}`);
  const documentsById = new Map(
    (sourceDocuments.length ? sourceDocuments : await listSupabaseSourceDocumentsForChunks(request.organizationId, chunks)).map((document) => [
      document.id,
      document,
    ])
  );

  return chunks.map((chunk) => ({
    ...chunk,
    source_document: documentsById.get(chunk.source_document_id) ?? null,
  }));
}

function toSearchResult(candidate: RagSearchCandidate, query: string): RagSearchResult {
  const sourceDocument = candidate.source_document;

  return {
    chunkId: candidate.id,
    sourceDocumentId: candidate.source_document_id,
    chunkIndex: candidate.chunk_index,
    content: candidate.content,
    contentHash: candidate.content_hash,
    contentCharStart: candidate.content_char_start,
    contentCharEnd: candidate.content_char_end,
    tokenCount: candidate.token_count,
    pageNumber: candidate.page_number ?? undefined,
    sectionTitle: candidate.section_title ?? undefined,
    parserConfidence: candidate.parser_confidence ?? undefined,
    metadata: candidate.metadata ?? {},
    score: candidate.rank ?? lexicalScore(candidate.content, query),
    sourceDocument: sourceDocument
      ? {
          id: sourceDocument.id,
          title: sourceDocument.title ?? undefined,
          fileName: sourceDocument.file_name,
          sourceType: sourceDocument.source_type,
          storagePath: sourceDocument.storage_path ?? undefined,
          sourceUri: sourceDocument.source_uri ?? undefined,
          targetType: sourceDocument.target_type ?? undefined,
          targetId: sourceDocument.target_id ?? undefined,
          metadata: sourceDocument.metadata ?? {},
        }
      : undefined,
  };
}

function compareSearchResults(left: RagSearchResult, right: RagSearchResult) {
  if (right.score !== left.score) return right.score - left.score;
  if (left.sourceDocumentId !== right.sourceDocumentId) return left.sourceDocumentId.localeCompare(right.sourceDocumentId);
  return left.chunkIndex - right.chunkIndex;
}

async function listSupabaseSourceDocuments(request: RagSearchRequest): Promise<RagSearchSourceDocument[]> {
  if (!request.sourceDocumentIds?.length && !request.targetType && !request.targetId) return [];

  const filters = [
    eqFilter('organization_id', request.organizationId),
    'select=id,organization_id,title,file_name,source_type,storage_path,source_uri,target_type,target_id,metadata',
  ];
  if (request.sourceDocumentIds?.length) {
    filters.push(`id=in.(${request.sourceDocumentIds.map(encodePostgrestListItem).join(',')})`);
  }
  if (request.targetType) filters.push(`target_type=eq.${encodeURIComponent(request.targetType)}`);
  if (request.targetId) filters.push(eqFilter('target_id', request.targetId));

  return supabaseRestRequest<RagSearchSourceDocument[]>(`source_documents?${filters.join('&')}`);
}

async function listSupabaseSourceDocumentsForChunks(
  organizationId: string,
  chunks: SupabaseChunkRow[]
): Promise<RagSearchSourceDocument[]> {
  const ids = Array.from(new Set(chunks.map((chunk) => chunk.source_document_id)));
  if (!ids.length) return [];

  const filters = [
    eqFilter('organization_id', organizationId),
    `id=in.(${ids.map(encodePostgrestListItem).join(',')})`,
    'select=id,organization_id,title,file_name,source_type,storage_path,source_uri,target_type,target_id,metadata',
  ];
  return supabaseRestRequest<RagSearchSourceDocument[]>(`source_documents?${filters.join('&')}`);
}

function lexicalScore(content: string, query: string) {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const terms = tokenizeQuery(query);
  const phraseBonus = lowerContent.includes(lowerQuery) ? 2 : 0;
  const termScore = terms.reduce((score, term) => score + countOccurrences(lowerContent, term), 0);
  return phraseBonus + termScore;
}

function countOccurrences(content: string, term: string) {
  let count = 0;
  let index = content.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = content.indexOf(term, index + term.length);
  }
  return count;
}

function tokenizeQuery(query: string) {
  return Array.from(new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []));
}

function normalizeLimit(value: number | undefined) {
  if (value === undefined) return DEFAULT_RAG_SEARCH_LIMIT;
  if (!Number.isFinite(value) || value < 1) throw new RangeError('limit must be a positive finite number.');
  return Math.min(Math.floor(value), MAX_RAG_SEARCH_LIMIT);
}

function normalizeSourceDocumentIds(values: string[] | undefined) {
  if (!values?.length) return undefined;
  const normalized = Array.from(new Set(values.map((value) => optionalBoundedString(value, 128)).filter(Boolean) as string[]));
  return normalized.length ? normalized : undefined;
}

function boundedRequiredString(value: string, field: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new RangeError(`${field} is required.`);
  if (normalized.length > maxLength) return normalized.slice(0, maxLength);
  return normalized;
}

function optionalBoundedString(value: string | undefined, maxLength: number) {
  if (value === undefined || value === null) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) return normalized.slice(0, maxLength);
  return normalized;
}

function encodePostgrestListItem(value: string) {
  return `"${encodeURIComponent(value.replace(/"/g, '\\"'))}"`;
}
