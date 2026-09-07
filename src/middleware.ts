import { defineMiddleware } from 'astro:middleware';
import { createAuth } from './lib/auth';
import {
  DEFAULT_ORG_ID,
  getOrganizationById,
  isCoordityApexHost,
  resolveOrganizationFromHost,
} from './lib/organization';
import { canAccessManagement, loadEmployee } from './lib/permissions';

const PUBLIC_PATHS = new Set([
  '/sign-in',
  '/embed/sign-in',
  '/accept-invite',
  '/bootstrap',
  '/robots.txt',
  '/favicon.png',
  '/favicon-16.png',
  '/apple-touch-icon.png',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/api/public/')) return true;
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname === '/api/session/sign-in') return true;
  if (pathname === '/api/session/sign-out') return true;
  if (pathname === '/api/bootstrap') return true;
  if (pathname === '/api/invites/accept') return true;
  if (pathname === '/api/orgs/resolve') return true;
  return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const hostname = context.url.hostname;
  const isApex = isCoordityApexHost(hostname);
  context.locals.isCoordityApex = isApex;

  try {
    context.locals.organization = await resolveOrganizationFromHost(hostname);
  } catch (error) {
    console.error('organization resolve failed', error);
    context.locals.organization = null;
  }

  // Unknown tenant subdomain on Coordity
  if (!isApex && !context.locals.organization && hostname.endsWith('.coordity.com')) {
    return new Response('Workspace not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  // Local/legacy hosts always have an org; ensure fallback
  if (!isApex && !context.locals.organization) {
    context.locals.organization = await getOrganizationById(DEFAULT_ORG_ID);
  }

  try {
    const auth = createAuth(context.request);
    const session = await auth.api.getSession({ headers: context.request.headers });
    context.locals.employee = session?.user ? await loadEmployee(session.user.id) : null;
  } catch (error) {
    console.error('session lookup failed', error);
    context.locals.employee = null;
  }
  const employee = context.locals.employee;

  // Coordity apex: product shell (workspace finder). App routes require a tenant host.
  if (isApex) {
    if (pathname === '/') {
      return context.redirect('/sign-in');
    }
    if (
      pathname === '/sign-in' ||
      pathname === '/api/orgs/resolve' ||
      pathname === '/api/session/sign-out' ||
      pathname.startsWith('/api/auth')
    ) {
      return next();
    }
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Open your organization workspace to continue.' }), {
        status: 400,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    return context.redirect('/sign-in');
  }

  if (isPublicPath(pathname)) {
    if (
      (pathname === '/sign-in' || pathname === '/bootstrap' || pathname === '/embed/sign-in') &&
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
    if (pathname === '/api/google-calendar/callback') {
      return context.redirect('/sign-in?next=/settings');
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

  if (pathname.startsWith('/management')) {
    const redirectPath = pathname.replace(/^\/management/, '/admin');
    return context.redirect(`${redirectPath}${context.url.search}`);
  }

  if (pathname.startsWith('/resources')) {
    return context.redirect('/');
  }

  if (pathname.startsWith('/bulletin-board')) {
    if (!canAccessManagement(employee)) {
      return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
    }
  }

  if (pathname.startsWith('/api/bulletin-board')) {
    const pinFileRead = /^\/api\/bulletin-board\/file\/pin\//.test(pathname);
    const employeeSubmit = pathname === '/api/bulletin-board/requests/create';
    if (!pinFileRead && !employeeSubmit && !canAccessManagement(employee)) {
      return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
    }
  }

  if (pathname.startsWith('/api/home-layout/update')) {
    if (!canAccessManagement(employee)) {
      return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
    }
  }

  if (
    pathname.startsWith('/admin') ||
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
