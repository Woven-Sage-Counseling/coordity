import type { APIRoute } from 'astro';
import {
  BULLETIN_MAX_IMAGE_BYTES,
  BULLETIN_MAX_PDF_BYTES,
  createBulletinBoardRequest,
  serializeRequest,
  type BulletinKind,
} from '../../../../lib/bulletin-board';
import { requirePortalOwner } from '../../../../lib/owner-access';

export const prerender = false;

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]!);
  return btoa(binary);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requirePortalOwner(locals.employee);
  if (denied) return denied;
  const employee = locals.employee!;

  const form = await request.formData();
  const kind = String(form.get('kind') ?? '').trim() as BulletinKind;
  const body = String(form.get('body') ?? '');
  const file = form.get('file');

  try {
    let fileName: string | null = null;
    let fileMime: string | null = null;
    let fileData: string | null = null;

    if (file instanceof File && file.size > 0) {
      if (kind === 'image') {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
          throw new Error('Use a JPEG, PNG, WebP, or GIF image.');
        }
        if (file.size > BULLETIN_MAX_IMAGE_BYTES) {
          throw new Error('Image is too large (max about 400KB for now).');
        }
      } else if (kind === 'pdf') {
        if (file.type !== 'application/pdf') {
          throw new Error('Upload a PDF file.');
        }
        if (file.size > BULLETIN_MAX_PDF_BYTES) {
          throw new Error('PDF is too large (max about 700KB for now).');
        }
      } else {
        throw new Error('Text requests do not take a file.');
      }
      fileName = file.name;
      fileMime = file.type;
      fileData = await fileToBase64(file);
    }

    const created = await createBulletinBoardRequest({
      submittedBy: employee.id,
      kind,
      body,
      fileName,
      fileMime,
      fileData,
    });

    return new Response(JSON.stringify({ ok: true, request: serializeRequest(created) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create request.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
