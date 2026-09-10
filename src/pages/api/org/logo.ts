import type { APIRoute } from 'astro';
import { getOrganizationLogo, orgIdFromLocals } from '../../../lib/organization';

export const prerender = false;

/** Public read — header / sign-in logo on tenant hosts. */
export const GET: APIRoute = async ({ locals, url }) => {
  const orgId = orgIdFromLocals(locals.organization);
  const file = await getOrganizationLogo(orgId);
  if (!file) return new Response('Not found', { status: 404 });

  const binary = Uint8Array.from(atob(file.dataBase64), (char) => char.charCodeAt(0));
  const version = url.searchParams.get('v') || String(file.updatedAt ?? '0');
  return new Response(binary, {
    status: 200,
    headers: {
      'content-type': file.mime,
      'cache-control': 'public, max-age=86400',
      etag: `"logo-${orgId}-${version}"`,
    },
  });
};
