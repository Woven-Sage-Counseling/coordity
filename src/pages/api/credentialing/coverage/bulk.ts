import type { APIRoute } from 'astro';
import {
  bulkSetProviderGroupCoverage,
  canManageCredentialing,
} from '../../../../lib/credentialing';
import { isCoverageStatusKey } from '../../../../lib/credentialing-status';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!canManageCredentialing(employee)) {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  let body: {
    providerId?: string;
    groupId?: string;
    status?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const providerId = String(body.providerId ?? '').trim();
  const groupId = String(body.groupId ?? '').trim();
  const statusRaw = String(body.status ?? '').trim();

  if (!providerId || !groupId) {
    return new Response(JSON.stringify({ ok: false, error: 'Provider and company are required.' }), {
      status: 400,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  if (!isCoverageStatusKey(statusRaw)) {
    return new Response(JSON.stringify({ ok: false, error: 'Choose a valid coverage status.' }), {
      status: 400,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  try {
    const result = await bulkSetProviderGroupCoverage({
      providerId,
      groupId,
      status: statusRaw,
      actorId: employee!.id,
    });

    return new Response(JSON.stringify({ ok: true, ...result, status: statusRaw }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not apply bulk coverage.',
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      },
    );
  }
};
