import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Google Workspace intake is disabled for this deployment. Use local CSV, Excel, PDF, or Word upload.',
    },
    { status: 410 }
  );
}
