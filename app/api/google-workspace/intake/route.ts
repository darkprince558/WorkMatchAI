import { NextResponse } from 'next/server';
import { assertCanPerform } from '@/lib/auth';
import { boundedString, getRouteAuthContext, HttpError, readJsonObject, routeErrorResponse } from '@/lib/api/route-helpers';
import { googleSheetsContentToImportReviewRecords } from '@/lib/imports/google-sheets';
import type { ImportTarget } from '@/lib/types';

const maxGoogleWorkspaceIntakeBytes = 1024 * 1024;

export async function POST(request: Request) {
  const auth = await getRouteAuthContext(request);
  if (auth instanceof NextResponse) return auth;

  try {
    assertCanPerform(auth, 'imports:create');

    const body = await readJsonObject(request, { maxBytes: maxGoogleWorkspaceIntakeBytes });
    const result = googleSheetsContentToImportReviewRecords(body, {
      target: readImportTarget(body.target ?? body.importTarget),
      sourceName: boundedString(body.sourceName ?? body.sourceFile ?? body.spreadsheetName, 'sourceName', {
        maxLength: 256,
        required: false,
      }),
    });

    return NextResponse.json({
      ...result,
      oauth: {
        required: false,
        implemented: false,
        note: 'This intake endpoint accepts connector-provided or posted Google Sheets tabular data. Google OAuth fetching is not implemented in this pass.',
      },
    });
  } catch (error) {
    return routeErrorResponse(error, 'Google Workspace intake could not be prepared.');
  }
}

function readImportTarget(value: unknown): ImportTarget {
  if (value === undefined || value === null || value === '') return 'auto';
  if (value === 'auto' || value === 'employee' || value === 'task' || value === 'roster') return value;
  throw new HttpError(400, 'target must be auto, employee, task, or roster.');
}
