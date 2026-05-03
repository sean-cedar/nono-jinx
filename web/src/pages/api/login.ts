import type { APIRoute } from 'astro';
import { checkPassword } from '../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { password } = body;

  if (!checkPassword(password)) {
    return new Response(JSON.stringify({ error: 'Invalid password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `nojinx_auth=authenticated; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 7}`,
    },
  });
};
