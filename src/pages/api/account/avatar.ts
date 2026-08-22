import type { APIRoute } from 'astro';
import { clearEmployeeAvatar, updateEmployeeAvatar } from '../../../lib/employees';
import { formErrorRedirect } from '../../../lib/http';

export const prerender = false;

const MAX_BYTES = 250_000;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  if (!actor || actor.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const action = String(form.get('action') ?? 'upload');

  if (action === 'remove') {
    try {
      await clearEmployeeAvatar({ userId: actor.id, actorUserId: actor.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove photo.';
      return formErrorRedirect('/account', message);
    }
    return new Response(null, { status: 303, headers: { Location: '/account' } });
  }

  const file = form.get('avatar');
  const dataUrl = String(form.get('avatarData') ?? '');

  try {
    if (dataUrl.startsWith('data:')) {
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) {
        return formErrorRedirect('/account', 'Invalid profile photo data.');
      }
      if (match[2].length > 350_000) {
        return formErrorRedirect('/account', 'Profile photo is too large. Try a smaller image.');
      }
      await updateEmployeeAvatar({
        userId: actor.id,
        mime: match[1],
        dataBase64: match[2],
        actorUserId: actor.id,
      });
    } else if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) {
        return formErrorRedirect('/account', 'Profile photo is too large. Try a smaller image.');
      }
      const mime = file.type;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        return formErrorRedirect('/account', 'Profile photos must be JPEG, PNG, or WebP.');
      }
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const dataBase64 = btoa(binary);
      await updateEmployeeAvatar({
        userId: actor.id,
        mime,
        dataBase64,
        actorUserId: actor.id,
      });
    } else {
      return formErrorRedirect('/account', 'Choose a photo to upload.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update photo.';
    return formErrorRedirect('/account', message);
  }

  return new Response(null, { status: 303, headers: { Location: '/account' } });
};
