import { NextRequest, NextResponse } from 'next/server';
import { adminApi } from '../../../../lib/admin-api';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return forward(request, await params, 'PATCH');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return forward(request, await params, 'POST');
}

async function forward(
  request: NextRequest,
  { id }: { id: string },
  method: 'PATCH' | 'POST',
) {
  try {
    const body = (await request.json()) as { action?: string };
    const action = body.action;
    const path = action
      ? `/v1/admin/story-clusters/${encodeURIComponent(id)}/${action}`
      : `/v1/admin/story-clusters/${encodeURIComponent(id)}/draft`;
    const { action: _action, ...details } = body;
    const data = await adminApi(path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(request.headers.get('idempotency-key')
          ? { 'idempotency-key': request.headers.get('idempotency-key')! }
          : {}),
      },
      body: JSON.stringify(details),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Request failed' },
      { status: 502 },
    );
  }
}
