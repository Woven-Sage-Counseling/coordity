import { formErrorRedirect } from './http';

function isAllowedReturnPath(path: string): boolean {
  return path === '/' || path === '/time-off';
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
