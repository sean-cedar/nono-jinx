import type { APIRoute } from 'astro';
import { getPostHistory } from '../../lib/redis';

export const GET: APIRoute = async ({ url }) => {
  try {
    const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);
    const history = await getPostHistory(Math.min(limit, 50));
    return new Response(JSON.stringify({ data: history }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
