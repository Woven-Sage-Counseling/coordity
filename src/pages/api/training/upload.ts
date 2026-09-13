import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { orgIdFromLocals } from '../../../lib/organization';
import {
  UPLOAD_DOC_KEYS,
  UPLOAD_MAX_BYTES,
  saveUploadDoc,
  type UploadDocKey,
} from '../../../lib/training';

export const prerender = false;

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();
  const blockId = String(form.get('blockId') ?? '').trim();
  const moduleId = String(form.get('moduleId') ?? '').trim();
  const lessonId = String(form.get('lessonId') ?? '').trim();
  const docKeyRaw = String(form.get('docKey') ?? '').trim();
  const textValue = String(form.get('textValue') ?? '');
  const file = form.get('file');
  const returnPath = `/training/${moduleId}/${lessonId}`;

  if (!UPLOAD_DOC_KEYS.includes(docKeyRaw as UploadDocKey)) {
    return formErrorRedirect(returnPath, 'Invalid document type.');
  }
  const docKey = docKeyRaw as UploadDocKey;

  try {
    let uploadFile: { name: string; mime: string; data: string } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > UPLOAD_MAX_BYTES) {
        throw new Error('File is too large (max about 1.2MB).');
      }
      uploadFile = {
        name: file.name,
        mime: file.type,
        data: await fileToBase64(file),
      };
    }

    await saveUploadDoc({
      userId: employee.id,
      blockId,
      orgId,
      docKey,
      file: uploadFile,
      textValue: form.has('textValue') ? textValue : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save upload.';
    return formErrorRedirect(returnPath, message);
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${returnPath}?upload=saved`,
      'Cache-Control': 'no-store',
    },
  });
};
