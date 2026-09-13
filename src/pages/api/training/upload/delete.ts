import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { requireManagementAccess } from '../../../../lib/management-access';
import { orgIdFromLocals } from '../../../../lib/organization';
import { UPLOAD_DOC_KEYS, deleteUploadDoc, type UploadDocKey } from '../../../../lib/training';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

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
    return formErrorRedirect(returnPath, message, 'trainingError');
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${returnPath}${returnPath.includes('?') ? '&' : '?'}uploadDeleted=1`,
      'Cache-Control': 'no-store',
    },
  });
};
