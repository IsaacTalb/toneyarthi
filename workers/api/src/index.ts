const service = 'api';

export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/' && url.pathname !== '/health') {
      return Response.json({ error: 'Not found', service }, { status: 404 });
    }

    return Response.json({ status: 'ok', service });
  },
} satisfies ExportedHandler;
