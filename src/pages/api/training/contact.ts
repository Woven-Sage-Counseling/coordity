import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { orgIdFromLocals } from '../../../lib/organization';
import { saveContactDetailsResponse } from '../../../lib/training';

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
    await saveContactDetailsResponse({
      userId: employee.id,
      blockId,
      orgId,
      answers: {
        fullName: String(form.get('fullName') ?? ''),
        phone: String(form.get('phone') ?? ''),
        workEmail: String(form.get('workEmail') ?? ''),
        jobTitle: String(form.get('jobTitle') ?? ''),
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
