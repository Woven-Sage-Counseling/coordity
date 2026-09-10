import type { APIRoute } from 'astro';
import {
  getOrganizationFavicon,
  orgIdFromLocals,
  updateOrganizationFavicon,
} from '../../../lib/organization';
import { requireManagementAccess } from '../../../lib/management-access';

export const prerender = false;

/** Public read — used by <link rel="icon"> on tenant hosts (including sign-in). */
export const GET: APIRoute = async ({ locals, url }) => {
  const orgId = orgIdFromLocals(locals.organization);
  const file = await getOrganizationFavicon(orgId);
  if (!file) return new Response('Not found', { status: 404 });

  const binary = Uint8Array.from(atob(file.dataBase64), (char) => char.charCodeAt(0));
  const version = url.searchParams.get('v') || String(file.updatedAt ?? '0');
  return new Response(binary, {
    status: 200,
    headers: {
      'content-type': file.mime,
      'cache-control': 'public, max-age=86400',
      etag: `"favicon-${orgId}-${version}"`,
    },
  });
};

/** Admin upload / clear. */
export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

  const form = await request.formData();
  const clear = ['1', 'true', 'on', 'yes'].includes(
    String(form.get('clear') ?? '')
      .trim()
      .toLowerCase(),
  );
  const file = form.get('favicon');

  try {
    const org = await updateOrganizationFavicon({
      orgId: orgIdFromLocals(locals.organization),
      file: file instanceof File ? file : null,
      clear,
    });
    return new Response(
      JSON.stringify({
        ok: true,
        hasFavicon: org.hasFavicon,
        faviconUpdatedAt: org.faviconUpdatedAt,
        faviconUrl: org.hasFavicon
          ? `/api/org/favicon?v=${org.faviconUpdatedAt ?? Date.now()}`
          : null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save favicon.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
