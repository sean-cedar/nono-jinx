import type { APIRoute } from 'astro';
import { getStats } from '../../lib/redis';

export const GET: APIRoute = async () => {
  try {
    const stats = await getStats();
    return new Response(JSON.stringify(stats), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
