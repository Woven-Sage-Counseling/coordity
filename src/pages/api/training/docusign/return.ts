import type { APIRoute } from 'astro';
import {
  getDocuSignEnvelopeForUser,
  getEnvelopeStatus,
  upsertTrainingEnvelope,
} from '../../../../lib/docusign';
import { orgIdFromLocals } from '../../../../lib/organization';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }
  const orgId = orgIdFromLocals(locals.organization);
  const moduleId = url.searchParams.get('moduleId') ?? '';
  const lessonId = url.searchParams.get('lessonId') ?? '';
  const blockId = url.searchParams.get('blockId') ?? '';
  const event = (url.searchParams.get('event') ?? '').toLowerCase();
  const returnPath = `/training/${moduleId}/${lessonId}`;

  try {
    const existing = await getDocuSignEnvelopeForUser(employee.id, blockId);
    if (existing) {
      let status = existing.status;
      if (event === 'signing_complete' || event === 'viewing_complete') {
        status = await getEnvelopeStatus(orgId, existing.envelopeId);
      } else if (event === 'decline') {
        status = 'declined';
      } else if (event === 'cancel' || event === 'ttl_expired' || event === 'session_timeout') {
        status = existing.status === 'completed' ? 'completed' : 'sent';
      } else {
        try {
          status = await getEnvelopeStatus(orgId, existing.envelopeId);
        } catch {
          status = existing.status;
        }
      }
      await upsertTrainingEnvelope({
        orgId,
        blockId,
        lessonId,
        userId: employee.id,
        envelopeId: existing.envelopeId,
        status,
      });
      if (status === 'completed') {
        return new Response(null, {
          status: 303,
          headers: {
            Location: `${returnPath}?docusign=completed`,
            'Cache-Control': 'no-store',
          },
        });
      }
      if (status === 'declined') {
        return new Response(null, {
          status: 303,
          headers: {
            Location: `${returnPath}?error=${encodeURIComponent('Document signing was declined.')}`,
            'Cache-Control': 'no-store',
          },
        });
      }
    }
  } catch {
    // Fall through to lesson with a soft message.
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${returnPath}?docusign=returned`,
      'Cache-Control': 'no-store',
    },
  });
};
