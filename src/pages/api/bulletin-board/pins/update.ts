import type { APIRoute } from 'astro';
import {
  getBulletinBoardSettings,
  serializePin,
  updateBulletinBoardPin,
} from '../../../../lib/bulletin-board';
import { requireManagementAccess } from '../../../../lib/management-access';
import { orgIdFromLocals } from '../../../../lib/organization';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

  const form = await request.formData();
  const clearExpires = String(form.get('clearExpires') ?? '') === '1';
  const expiresRaw = String(form.get('expiresAt') ?? '').trim();

  try {
    const pin = await updateBulletinBoardPin({
      id: String(form.get('id') ?? '').trim(),
      xPct: form.has('xPct') ? Number(form.get('xPct')) : undefined,
      yPct: form.has('yPct') ? Number(form.get('yPct')) : undefined,
      widthPct: form.has('widthPct') ? Number(form.get('widthPct')) : undefined,
      rotationDeg: form.has('rotationDeg') ? Number(form.get('rotationDeg')) : undefined,
      color: form.has('color') ? String(form.get('color') ?? '') : undefined,
      fontSizeRem: form.has('fontSizeRem') ? Number(form.get('fontSizeRem')) : undefined,
      body: form.has('body') ? String(form.get('body') ?? '') : undefined,
      clearExpires,
      expiresAt: !clearExpires && expiresRaw ? Number(expiresRaw) : undefined,
    });
    const settings = await getBulletinBoardSettings(orgIdFromLocals(locals.organization));
    return new Response(JSON.stringify({ ok: true, pin: serializePin(pin, settings.draftSurface) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update pin.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
