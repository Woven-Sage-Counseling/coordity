import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { markEarlyAccessReviewed } from '../../../../lib/early-access';
import { hasPlatformPermission } from '../../../../lib/platform-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const staff = locals.platformStaff;
  if (!locals.isCoordityApex || !hasPlatformPermission(staff, 'platform:access')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const id = String(form.get('id') ?? '').trim();
  if (!id) {
    return formErrorRedirect('/platform/requests', 'Missing request id.');
  }

  try {
    await markEarlyAccessReviewed({ id, reviewedBy: staff!.userId });
  } catch (error) {
    console.error('mark early access reviewed failed', error);
    return formErrorRedirect('/platform/requests', 'Could not update that request.');
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/platform/requests?saved=reviewed', 'Cache-Control': 'no-store' },
  });
};
