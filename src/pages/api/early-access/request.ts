import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { submitEarlyAccessRequest } from '../../../lib/early-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.isCoordityApex) {
    return formErrorRedirect('/early-access', 'Open coordity.com to request early access.');
  }

  const form = await request.formData();
  const result = await submitEarlyAccessRequest({
    name: String(form.get('name') ?? ''),
    email: String(form.get('email') ?? ''),
    practiceName: String(form.get('practiceName') ?? ''),
    phone: String(form.get('phone') ?? ''),
    title: String(form.get('title') ?? ''),
    message: String(form.get('message') ?? ''),
  });

  if (!result.ok) {
    return formErrorRedirect('/early-access', result.error);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/early-access?sent=1', 'Cache-Control': 'no-store' },
  });
};
