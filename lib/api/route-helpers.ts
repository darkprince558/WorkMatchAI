import { NextResponse } from 'next/server';
import {
  AuthConfigurationError,
  AuthProviderError,
  AuthRequiredError,
  AuthorizationError,
  requireAuthContext,
  type AuthContext,
} from '@/lib/auth';

const defaultMaxJsonBytes = 256 * 1024;
const textDecoder = new TextDecoder('utf-8', { fatal: false });

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function getRouteAuthContext(request: Request): Promise<AuthContext | NextResponse> {
  try {
    return await requireAuthContext(request);
  } catch (error) {
    return routeErrorResponse(error, 'Authentication failed.');
  }
}

export async function readJsonBody(request: Request, options: { maxBytes?: number } = {}) {
  const contentType = request.headers.get('content-type');
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }

  const maxBytes = options.maxBytes ?? defaultMaxJsonBytes;
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const parsedContentLength = Number(contentLength);
    if (!Number.isFinite(parsedContentLength) || parsedContentLength < 0) {
      throw new HttpError(400, 'Content-Length is invalid.');
    }
    if (parsedContentLength > maxBytes) {
      throw new HttpError(413, 'Request body is too large.');
    }
  }

  try {
    return JSON.parse(await readRequestText(request, maxBytes));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

export async function readJsonObject(
  request: Request,
  options: { maxBytes?: number } = {}
): Promise<Record<string, unknown>> {
  const body = await readJsonBody(request, options);
  if (!isPlainObject(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  return body;
}

export function routeErrorResponse(error: unknown, fallbackMessage = 'Request failed.', fallbackStatus = 500) {
  if (
    error instanceof HttpError ||
    error instanceof AuthorizationError ||
    error instanceof AuthRequiredError ||
    error instanceof AuthProviderError ||
    error instanceof AuthConfigurationError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: fallbackMessage }, { status: fallbackStatus });
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function boundedString(
  value: unknown,
  field: string,
  options: { maxLength?: number; required: false }
): string | undefined;
export function boundedString(value: unknown, field: string, options?: { maxLength?: number; required?: true }): string;
export function boundedString(value: unknown, field: string, options: { maxLength?: number; required?: boolean } = {}) {
  if (typeof value !== 'string') {
    if (options.required === false || value === undefined || value === null) return undefined;
    throw new HttpError(400, `${field} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed && options.required !== false) {
    throw new HttpError(400, `${field} is required.`);
  }

  const maxLength = options.maxLength ?? 256;
  return trimmed.slice(0, maxLength);
}

async function readRequestText(request: Request, maxBytes: number) {
  if (!request.body) {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new HttpError(413, 'Request body is too large.');
    }
    return text;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      throw new HttpError(413, 'Request body is too large.');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return textDecoder.decode(bytes);
}
