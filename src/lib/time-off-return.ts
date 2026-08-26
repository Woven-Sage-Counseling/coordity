import { formErrorRedirect } from './http';

function isAllowedReturnPath(path: string): boolean {
  return path === '/' || path === '/time-off';
}

export function wantsJson(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json');
}

export function timeOffJsonOk(data: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function timeOffJsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Safe internal redirect after time-off form posts. */
export function resolveTimeOffReturnTo(form: FormData, fallback: string): string {
  const raw = String(form.get('returnTo') ?? '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;

  try {
    const url = new URL(raw, 'https://portal.local');
    if (!isAllowedReturnPath(url.pathname)) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function timeOffErrorRedirect(form: FormData, message: string): Response {
  const target = resolveTimeOffReturnTo(form, '/time-off');
  try {
    const url = new URL(target, 'https://portal.local');
    if (url.pathname === '/') {
      return formErrorRedirect('/', message, 'timeOffError');
    }
  } catch {
    /* fall through */
  }
  return formErrorRedirect('/time-off', message);
}

export function timeOffErrorResponse(
  request: Request,
  form: FormData,
  message: string,
  status = 400,
): Response {
  if (wantsJson(request)) return timeOffJsonError(message, status);
  return timeOffErrorRedirect(form, message);
}
