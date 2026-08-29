import type { APIRoute } from 'astro';
import {
  canManageCredentialing,
  setProviderPlanCoverage,
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

  let body: { providerId?: string; planId?: string; status?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const providerId = String(body.providerId ?? '').trim();
  const planId = String(body.planId ?? '').trim();
  const statusRaw = String(body.status ?? '').trim();

  if (!providerId || !planId) {
    return new Response(JSON.stringify({ ok: false, error: 'Provider and plan are required.' }), {
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
    await setProviderPlanCoverage({
      providerId,
      planId,
      status: statusRaw,
      actorId: employee!.id,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Could not save coverage.',
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      },
    );
  }

  return new Response(JSON.stringify({ ok: true, status: statusRaw }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
