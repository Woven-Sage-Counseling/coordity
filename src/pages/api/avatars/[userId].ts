import type { APIRoute } from 'astro';
import { getEmployeeAvatar } from '../../../lib/employees';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const actor = locals.employee;
  if (!actor || actor.status !== 'active') {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = String(params.userId ?? '');
  if (!userId) {
    return new Response('Not found', { status: 404 });
  }

  const avatar = await getEmployeeAvatar(userId);
  if (!avatar) {
    return new Response('Not found', { status: 404 });
  }

  const binary = Uint8Array.from(atob(avatar.dataBase64), (char) => char.charCodeAt(0));
  return new Response(binary, {
    status: 200,
    headers: {
      'content-type': avatar.mime,
      'cache-control': 'private, max-age=3600',
    },
  });
};
