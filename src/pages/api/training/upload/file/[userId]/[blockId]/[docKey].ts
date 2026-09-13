import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../../../../../lib/permissions';
import { orgIdFromLocals } from '../../../../../../../lib/organization';
import { UPLOAD_DOC_KEYS, getUploadFileForDownload, type UploadDocKey } from '../../../../../../../lib/training';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const userId = String(params.userId ?? '').trim();
  const blockId = String(params.blockId ?? '').trim();
  const docKeyRaw = String(params.docKey ?? '').trim();
  if (!UPLOAD_DOC_KEYS.includes(docKeyRaw as UploadDocKey)) {
    return new Response('Not found', { status: 404 });
  }

  if (employee.id !== userId && !canAccessManagement(employee)) {
    return new Response('Forbidden', { status: 403 });
  }

  const file = await getUploadFileForDownload({
    orgId: orgIdFromLocals(locals.organization),
    userId,
    blockId,
    docKey: docKeyRaw as UploadDocKey,
  });
  if (!file) return new Response('Not found', { status: 404 });

  const binary = Uint8Array.from(atob(file.fileData), (char) => char.charCodeAt(0));
  const safeName = (file.fileName ?? 'document').replace(/"/g, '');
  return new Response(binary, {
    status: 200,
    headers: {
      'content-type': file.fileMime,
      'cache-control': 'private, no-store',
      'content-disposition': `attachment; filename="${safeName}"`,
    },
  });
};
