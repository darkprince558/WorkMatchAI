import { NextResponse } from 'next/server';
import { assertCanPerform } from '@/lib/auth';
import { boundedString, getRouteAuthContext, HttpError, readJsonObject, routeErrorResponse } from '@/lib/api/route-helpers';
import { searchRagDocumentChunks, MAX_RAG_SEARCH_LIMIT, type RagSearchInput, type RagTargetType } from '@/lib/rag';

const targetTypes = new Set<RagTargetType>(['employee', 'task', 'import', 'organization']);

export async function POST(request: Request) {
  const auth = await getRouteAuthContext(request);
  if (auth instanceof NextResponse) return auth;

  try {
    assertCanPerform(auth, 'tasks:read');

    const body = await readJsonObject(request, { maxBytes: 32 * 1024 });
    const searchInput = readRagSearchInput(body, auth.organizationId);
    const results = await searchRagDocumentChunks(searchInput);

    return NextResponse.json({
      query: searchInput.query,
      count: results.length,
      results,
    });
  } catch (error) {
    return routeErrorResponse(error, 'RAG search could not be completed.');
  }
}

function readRagSearchInput(body: Record<string, unknown>, organizationId: string): RagSearchInput {
  return {
    organizationId,
    query: boundedString(body.query, 'query', { maxLength: 512 }),
    limit: readLimit(body.limit),
    sourceDocumentIds: readSourceDocumentIds(body.sourceDocumentIds),
    targetType: readTargetType(body.targetType),
    targetId: boundedString(body.targetId, 'targetId', { maxLength: 128, required: false }),
  };
}

function readLimit(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit < 1) throw new HttpError(400, 'limit must be a positive number.');
  return Math.min(Math.floor(limit), MAX_RAG_SEARCH_LIMIT);
}

function readSourceDocumentIds(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, 'sourceDocumentIds must be an array.');
  if (value.length > 50) throw new HttpError(400, 'sourceDocumentIds cannot contain more than 50 values.');

  const ids = value.map((item) => {
    if (typeof item !== 'string') throw new HttpError(400, 'sourceDocumentIds must contain strings.');
    return item.trim();
  });

  return Array.from(new Set(ids.filter(Boolean).map((id) => id.slice(0, 128))));
}

function readTargetType(value: unknown): RagTargetType | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !targetTypes.has(value as RagTargetType)) {
    throw new HttpError(400, 'targetType is invalid.');
  }
  return value as RagTargetType;
}
