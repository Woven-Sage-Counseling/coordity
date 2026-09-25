import type { APIRoute } from 'astro';
import { getQuickLinkIcon } from '../../../../lib/quick-link-icons';
import { orgIdFromLocals } from '../../../../lib/organization';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const actor = locals.employee;
  if (!actor || actor.status !== 'active' || !actor.permissions.includes('portal:access')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const linkId = String(params.linkId ?? '').trim();
  if (!linkId) return new Response('Not found', { status: 404 });

  const file = await getQuickLinkIcon(orgIdFromLocals(locals.organization), linkId);
  if (!file) return new Response('Not found', { status: 404 });

  const binary = Uint8Array.from(atob(file.dataBase64), (char) => char.charCodeAt(0));
  return new Response(binary, {
    status: 200,
    headers: {
      'content-type': file.mime,
      'cache-control': 'private, max-age=86400',
      etag: `"quick-link-icon-${linkId}-${file.updatedAt}"`,
    },
  });
};
