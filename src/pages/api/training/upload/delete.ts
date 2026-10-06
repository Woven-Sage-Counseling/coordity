import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { requireManagementAccess } from '../../../../lib/management-access';
import { orgIdFromLocals } from '../../../../lib/organization';
import { UPLOAD_DOC_KEYS, deleteUploadDoc, type UploadDocKey } from '../../../../lib/training';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const asJson = request.headers.get('X-Requested-With') === 'training-autosave';
  const denied = requireManagementAccess(locals.employee);
  if (denied) {
    if (asJson) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    return denied;
  }

  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();
  const userId = String(form.get('userId') ?? '').trim();
  const blockId = String(form.get('blockId') ?? '').trim();
  const docKeyRaw = String(form.get('docKey') ?? '').trim();
  const traineeId = String(form.get('trainee') ?? '').trim();
  const returnPath = traineeId
    ? `/admin?${new URLSearchParams({ trainee: traineeId }).toString()}#training-progress`
    : '/admin#training-progress';

  if (!UPLOAD_DOC_KEYS.includes(docKeyRaw as UploadDocKey)) {
    if (asJson) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid document type.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    return formErrorRedirect(returnPath, 'Invalid document type.', 'trainingError');
  }

  try {
    await deleteUploadDoc({
      orgId,
      userId,
      blockId,
      docKey: docKeyRaw as UploadDocKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete upload.';
    if (asJson) {
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    return formErrorRedirect(returnPath, message, 'trainingError');
  }

  if (asJson) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${returnPath}${returnPath.includes('?') ? '&' : '?'}uploadDeleted=1`,
      'Cache-Control': 'no-store',
    },
  });
};
