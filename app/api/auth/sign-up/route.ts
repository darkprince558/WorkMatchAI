import { NextResponse } from 'next/server';
import { AuthConfigurationError, AuthProviderError, authContextFromSupabaseUser, normalizeSupabaseSession, signUpWithPassword } from '@/lib/auth';
import { boundedString, HttpError, readJsonObject, routeErrorResponse } from '@/lib/api/route-helpers';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/api/rate-limit';
import { setAuthCookies } from '../cookies';

const signUpRateLimit = {
  limit: 5,
  windowMs: 60 * 60 * 1000,
};

export async function POST(request: Request) {
  try {
    if (process.env.WORKMATCH_ALLOW_SELF_SIGN_UP !== 'true') {
      return NextResponse.json({ error: 'Self sign-up is disabled for this deployment.' }, { status: 403 });
    }

    const body = await readJsonObject(request, { maxBytes: 8 * 1024 });
    const email = normalizeEmail(body.email);
    const password = readPassword(body.password);
    const fullName = boundedString(body.fullName, 'fullName', { maxLength: 120, required: false });

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const rateLimit = await checkRateLimit(`auth:sign-up:${getClientIp(request)}:${email}`, signUpRateLimit);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

    const result = await signUpWithPassword({ email, password, fullName });
    const session = normalizeSupabaseSession(result);
    if (session?.user) authContextFromSupabaseUser(session.user);
    const response = NextResponse.json({
      ok: true,
      emailConfirmationRequired: !session,
    });

    if (session) setAuthCookies(response, session);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthConfigurationError || error instanceof AuthProviderError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return routeErrorResponse(error, 'Sign up failed.');
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new HttpError(400, 'A valid email address is required.');
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'A valid email address is required.');
  }
  return email;
}

function readPassword(value: unknown) {
  if (typeof value !== 'string' || !value) throw new HttpError(400, 'Password is required.');
  if (value.length > 256) throw new HttpError(400, 'Password is too long.');
  return value;
}
