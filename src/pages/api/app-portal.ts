import type { APIRoute } from 'astro';
import { getAppPortalTheme, saveAppPortalTheme, themeFromFields } from '../../lib/app-portal';
import { canAccessManagement } from '../../lib/permissions';
import { orgIdFromLocals } from '../../lib/organization';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const { theme, customized } = await getAppPortalTheme(orgIdFromLocals(locals.organization));
  return new Response(JSON.stringify({ ok: true, theme, customized }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!canAccessManagement(employee)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = (await request.json().catch(() => null)) as Partial<{
    background: string;
    surface: string;
    accent: string;
    ink: string;
  }> | null;
  const theme = await saveAppPortalTheme(orgIdFromLocals(locals.organization), themeFromFields(body));
  return new Response(JSON.stringify({ ok: true, theme, customized: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
