// Cloudflare Worker: serves the static site (Workers Static Assets) and handles
// the few dynamic routes. Only /api/* runs this code; every page is a static file.
export interface Env {
  ASSETS: Fetcher;
  EVENTS?: AnalyticsEngineDataset; // optional: Workers Analytics Engine dataset
}

const ALLOWED_EVENTS = /^[a-z0-9_-]{2,64}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Commercial-click tracking (BOOK NOW, boats, WhatsApp, directions...).
    // Stores anonymous counts only: event name, page path, country. No cookies, no IP.
    if (url.pathname === '/api/event') {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      try {
        const body = (await request.json()) as { event?: string; page?: string };
        const event = String(body.event ?? '');
        const page = String(body.page ?? '').slice(0, 200);
        if (ALLOWED_EVENTS.test(event) && env.EVENTS) {
          env.EVENTS.writeDataPoint({
            blobs: [event, page, String((request as any).cf?.country ?? '')],
            doubles: [1],
            indexes: [event],
          });
        }
      } catch {
        /* ignore malformed beacons */
      }
      return new Response(null, { status: 204 });
    }

    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
