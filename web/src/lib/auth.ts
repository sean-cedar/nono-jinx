export function isAuthenticated(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/nojinx_auth=([^;]+)/);
  return match?.[1] === 'authenticated';
}

export function checkPassword(password: string): boolean {
  const expected = import.meta.env.ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return password === expected;
}
