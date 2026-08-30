import type { ApiResponse } from '@toneyarthi/types';

const service = 'ingest';

type HealthResponse = ApiResponse<{ status: 'ok'; service: typeof service }>;
type HealthPayload = NonNullable<HealthResponse['data']>;

export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/' && url.pathname !== '/health') {
      return Response.json({ error: 'Not found', service }, { status: 404 });
    }

    const health = { status: 'ok', service } satisfies HealthPayload;

    return Response.json(health);
  },
} satisfies ExportedHandler;
