import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import {
  denyEarlyAccessRequest,
  inviteEarlyAccessRequest,
  restoreEarlyAccessRequest,
} from '../../../../lib/early-access';
import { hasPlatformPermission } from '../../../../lib/platform-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const staff = locals.platformStaff;
  if (!locals.isCoordityApex || !hasPlatformPermission(staff, 'platform:access')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const id = String(form.get('id') ?? '').trim();
  const action = String(form.get('action') ?? '').trim();
  if (!id) {
    return formErrorRedirect('/platform/requests', 'Missing request id.');
  }

  try {
    if (action === 'invite') {
      const result = await inviteEarlyAccessRequest({
        id,
        reviewedBy: staff!.userId,
        origin: url.origin,
      });
      if (!result.ok) {
        return formErrorRedirect('/platform/requests', result.error);
      }
      return new Response(null, {
        status: 303,
        headers: { Location: '/platform/requests?saved=invited', 'Cache-Control': 'no-store' },
      });
    }

    if (action === 'deny') {
      const result = await denyEarlyAccessRequest({
        id,
        reviewedBy: staff!.userId,
      });
      if (!result.ok) {
        return formErrorRedirect('/platform/requests', result.error);
      }
      return new Response(null, {
        status: 303,
        headers: { Location: '/platform/requests?saved=denied', 'Cache-Control': 'no-store' },
      });
    }

    if (action === 'restore') {
      await restoreEarlyAccessRequest(id);
      return new Response(null, {
        status: 303,
        headers: {
          Location: '/platform/requests?saved=restored',
          'Cache-Control': 'no-store',
        },
      });
    }

    return formErrorRedirect('/platform/requests', 'Unknown action.');
  } catch (error) {
    console.error('early access review action failed', error);
    return formErrorRedirect('/platform/requests', 'Could not update that request.');
  }
};
