import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { orgIdFromLocals } from '../../../lib/organization';
import {
  CONTACT_HEADSHOT_MAX_BYTES,
  parsePreferredContact,
  saveContactDetailsResponse,
} from '../../../lib/training';

export const prerender = false;

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
  const returnPath = `/training/${moduleId}/${lessonId}`;

  try {
    const headshotFile = form.get('headshot');
    let headshot: { mime: string; data: string } | null = null;
    if (headshotFile instanceof File && headshotFile.size > 0) {
      if (headshotFile.size > CONTACT_HEADSHOT_MAX_BYTES) {
        throw new Error('Headshot is too large. Try a smaller image.');
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(headshotFile.type)) {
        throw new Error('Headshots must be JPEG, PNG, or WebP.');
      }
      const bytes = new Uint8Array(await headshotFile.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      headshot = { mime: headshotFile.type, data: btoa(binary) };
    }

    await saveContactDetailsResponse({
      userId: employee.id,
      blockId,
      orgId,
      headshot,
      answers: {
        fullName: String(form.get('fullName') ?? ''),
        phone: String(form.get('phone') ?? ''),
        workEmail: String(form.get('workEmail') ?? ''),
        jobTitle: String(form.get('jobTitle') ?? ''),
        address: String(form.get('address') ?? ''),
        preferredContact: parsePreferredContact(form.getAll('preferredContact')),
        hasHeadshot: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save contact details.';
    return formErrorRedirect(returnPath, message);
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${returnPath}?contact=saved`,
      'Cache-Control': 'no-store',
    },
  });
};
