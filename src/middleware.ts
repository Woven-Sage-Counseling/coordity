import { defineMiddleware } from 'astro:middleware';
import { createAuth } from './lib/auth';
import { canAccessManagement, loadEmployee } from './lib/permissions';

const PUBLIC_PATHS = new Set([
  '/sign-in',
  '/accept-invite',
  '/bootstrap',
  '/robots.txt',
  '/favicon.png',
  '/favicon-16.png',
  '/apple-touch-icon.png',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname === '/api/session/sign-in') return true;
  if (pathname === '/api/session/sign-out') return true;
  if (pathname === '/api/bootstrap') return true;
  if (pathname === '/api/invites/accept') return true;
  return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  try {
    const auth = createAuth(context.request);
    const session = await auth.api.getSession({ headers: context.request.headers });
    context.locals.employee = session?.user ? await loadEmployee(session.user.id) : null;
  } catch (error) {
    console.error('session lookup failed', error);
    context.locals.employee = null;
  }
  const employee = context.locals.employee;

  if (isPublicPath(pathname)) {
    if (
      (pathname === '/sign-in' || pathname === '/bootstrap') &&
      employee?.status === 'active' &&
      employee.permissions.includes('portal:access')
    ) {
      return context.redirect('/');
    }
    return next();
  }

  if (!employee || employee.status !== 'active' || !employee.permissions.includes('portal:access')) {
    if (pathname === '/api/quickbooks/callback') {
      return context.redirect('/sign-in?next=/financials');
    }
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    const nextUrl = pathname === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(pathname)}`;
    return context.redirect(nextUrl);
  }

  if (pathname.startsWith('/financials') || pathname.startsWith('/api/financials')) {
    if (!employee.permissions.includes('financials:view')) {
      return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
    }
  }

  if (
    pathname.startsWith('/management') ||
    pathname.startsWith('/api/announcements/create') ||
    pathname.startsWith('/api/announcements/archive') ||
    pathname.startsWith('/api/announcements/update') ||
    pathname.startsWith('/api/announcements/resend') ||
    pathname.startsWith('/api/announcements/delete')
  ) {
    if (!canAccessManagement(employee)) {
      return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
    }
  }

  if (pathname.startsWith('/api/employees')) {
    if (!employee.permissions.includes('employees:manage') && !canAccessManagement(employee)) {
      return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
    }
  }

  if (pathname.startsWith('/api/quickbooks')) {
    if (!employee.permissions.includes('financials:manage')) {
      return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
    }
  }

  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
