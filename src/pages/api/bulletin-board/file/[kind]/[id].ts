import type { APIRoute } from 'astro';
import { getBulletinPinFile, getBulletinRequestFile } from '../../../../../lib/bulletin-board';
import { isPortalOwner } from '../../../../../lib/permissions';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const kind = String(params.kind ?? '');
  const id = String(params.id ?? '');

  // Pending request files stay owner-only; live pin files are visible to the org.
  if (kind === 'request' && !isPortalOwner(employee)) {
    return new Response('Forbidden', { status: 403 });
  }

  const file =
    kind === 'pin' ? await getBulletinPinFile(id) : kind === 'request' ? await getBulletinRequestFile(id) : null;

  if (!file) return new Response('Not found', { status: 404 });

  const binary = Uint8Array.from(atob(file.dataBase64), (char) => char.charCodeAt(0));
  return new Response(binary, {
    status: 200,
    headers: {
      'content-type': file.mime,
      'cache-control': 'private, no-store',
      ...(file.fileName
        ? { 'content-disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"` }
        : {}),
    },
  });
};
