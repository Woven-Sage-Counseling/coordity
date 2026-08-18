export function applySetCookieHeaders(from: Headers, to: Headers): void {
  const cookies =
    typeof from.getSetCookie === 'function' ? from.getSetCookie() : fallbackCookies(from);
  for (const cookie of cookies) {
    to.append('Set-Cookie', cookie);
  }
}

function fallbackCookies(headers: Headers): string[] {
  const value = headers.get('set-cookie');
  return value ? [value] : [];
}

export function formErrorRedirect(path: string, message: string): Response {
  const url = `${path}?error=${encodeURIComponent(message)}`;
  return new Response(null, {
    status: 303,
    headers: { Location: url },
  });
}
