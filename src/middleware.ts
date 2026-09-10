import { defineMiddleware } from 'astro:middleware';
import { createAuth } from './lib/auth';
import {
  DEFAULT_ORG_ID,
  getOrganizationById,
  isCoordityApexHost,
  isOrganizationMember,
  resolveOrganizationFromHost,
} from './lib/organization';
import { canAccessManagement, loadEmployee } from './lib/permissions';
import { loadPlatformStaff } from './lib/platform-access';
import { requestHostname } from './lib/request-host';

const PUBLIC_PATHS = new Set([
  '/sign-in',
  '/sign-up',
  '/embed/sign-in',
  '/accept-invite',
  '/bootstrap',
  '/robots.txt',
  '/favicon.ico',
  '/favicon.png',
  '/favicon-16.png',
  '/favicon-coordity.svg',
  '/favicon-coordity.png',
  '/favicon-coordity-16.png',
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
  if (pathname === '/api/orgs/create') return true;
  if (pathname === '/api/org/favicon') return true;
  if (pathname === '/api/org/logo') return true;
  return false;
}

function isPlatformPublicPath(pathname: string): boolean {
  return (
    pathname === '/platform/sign-in' ||
    pathname === '/platform/bootstrap' ||
    pathname === '/api/platform/bootstrap' ||
    pathname === '/api/platform/session/sign-in' ||
    pathname === '/api/session/sign-out'
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const hostname = requestHostname(context.request, context.url.hostname);

  if (hostname === 'portal.wovensage.com') {
    const dest = new URL(context.url);
    dest.protocol = 'https:';
    dest.host = 'wovensage.coordity.com';
    return Response.redirect(dest.toString(), 301);
  }

  const isApex = isCoordityApexHost(hostname);
  context.locals.isCoordityApex = isApex;
  context.locals.platformStaff = null;

  try {
    context.locals.organization = await resolveOrganizationFromHost(hostname);
  } catch (error) {
    console.error('organization resolve failed', error);
    context.locals.organization = null;
  }

  if (!isApex && !context.locals.organization && hostname.endsWith('.coordity.com')) {
    return new Response('Workspace not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  if (!isApex && !context.locals.organization) {
    context.locals.organization = await getOrganizationById(DEFAULT_ORG_ID);
  }

  let sessionUserId: string | null = null;
  try {
    const auth = createAuth(context.request);
    const session = await auth.api.getSession({ headers: context.request.headers });
    sessionUserId = session?.user?.id ?? null;
    let employee = sessionUserId ? await loadEmployee(sessionUserId) : null;
    if (employee && context.locals.organization) {
      const member = await isOrganizationMember(context.locals.organization.id, employee.id);
      if (!member) employee = null;
    }
    context.locals.employee = employee;
    if (isApex && sessionUserId) {
      context.locals.platformStaff = await loadPlatformStaff(sessionUserId);
    }
  } catch (error) {
    console.error('session lookup failed', error);
    context.locals.employee = null;
    context.locals.platformStaff = null;
  }
  const employee = context.locals.employee;

  if (isApex) {
    if (pathname === '/') {
      return context.rewrite('/apex-landing');
    }

    if (
      pathname === '/apex-landing' ||
      pathname === '/sign-up' ||
      pathname === '/continue' ||
      pathname === '/early-access' ||
      pathname === '/api/early-access/request' ||
      pathname === '/api/orgs/resolve' ||
      pathname === '/api/orgs/create' ||
      pathname === '/api/session/sign-out' ||
      pathname.startsWith('/api/auth') ||
      pathname === '/favicon.ico' ||
      pathname.startsWith('/favicon') ||
      pathname === '/apple-touch-icon.png' ||
      pathname === '/robots.txt' ||
      isPlatformPublicPath(pathname)
    ) {
      return next();
    }

    if (pathname === '/sign-in') {
      return context.redirect('/continue');
    }

    if (pathname.startsWith('/platform') || pathname.startsWith('/api/platform')) {
      const staff = context.locals.platformStaff;
      if (!staff || !staff.permissions.includes('platform:access')) {
        if (pathname.startsWith('/api/')) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
          });
        }
        return context.redirect('/platform/sign-in');
      }
      const response = await next();
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return response;
    }

    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Open your organization workspace to continue.' }), {
        status: 400,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    return context.redirect('/');
  }

  if (isPublicPath(pathname)) {
    if (
      (pathname === '/sign-in' || pathname === '/bootstrap' || pathname === '/embed/sign-in') &&
      employee?.status === 'active' &&
      employee.permissions.includes('portal:access')
    ) {
      return context.redirect('/');
    }
    const response = await next();
    if (pathname.startsWith('/embed/')) {
      response.headers.delete('X-Frame-Options');
      response.headers.set('Content-Security-Policy', 'frame-ancestors *');
    }
    if (pathname !== '/api/org/favicon' && pathname !== '/api/org/logo') {
      response.headers.set('Cache-Control', 'no-store');
    }
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
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

  if (pathname.startsWith('/api/home-layout/update') || pathname === '/api/org/branding') {
    if (!canAccessManagement(employee)) {
      return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
    }
  }

  if (pathname === '/api/org/favicon' && context.request.method !== 'GET') {
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
