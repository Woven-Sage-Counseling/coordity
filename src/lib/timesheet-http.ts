import { formErrorRedirect } from './http';

function isAllowedReturnPath(path: string): boolean {
  return path === '/' || path === '/timesheet';
}

export function wantsJson(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json');
}

export function timesheetJsonOk(data: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function timesheetJsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function resolveTimesheetReturnTo(form: FormData, fallback: string): string {
  const raw = String(form.get('returnTo') ?? '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;

  try {
    const url = new URL(raw, 'https://portal.local');
    if (!isAllowedReturnPath(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function timesheetErrorRedirect(form: FormData, message: string): Response {
  const target = resolveTimesheetReturnTo(form, '/timesheet');
  try {
    const url = new URL(target, 'https://portal.local');
    if (url.pathname === '/') {
      return formErrorRedirect('/', message, 'timesheetError');
    }
  } catch {
    /* fall through */
  }
  return formErrorRedirect('/timesheet', message);
}

export function timesheetErrorResponse(
  request: Request,
  form: FormData,
  message: string,
  status = 400,
): Response {
  if (wantsJson(request)) return timesheetJsonError(message, status);
  return timesheetErrorRedirect(form, message);
}
