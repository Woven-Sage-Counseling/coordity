import type { APIRoute } from 'astro';
import {
  getBulletinBoardSettings,
  placePinFromRequest,
  serializePin,
} from '../../../../lib/bulletin-board';
import { requirePortalOwner } from '../../../../lib/owner-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requirePortalOwner(locals.employee);
  if (denied) return denied;
  const employee = locals.employee!;

  const form = await request.formData();
  const expiresRaw = String(form.get('expiresAt') ?? '').trim();
  const expiresAt = expiresRaw ? Number(expiresRaw) : null;

  try {
    const pin = await placePinFromRequest({
      requestId: String(form.get('requestId') ?? '').trim(),
      createdBy: employee.id,
      xPct: Number(form.get('xPct') ?? 38),
      yPct: Number(form.get('yPct') ?? 36),
      widthPct: Number(form.get('widthPct') ?? 24),
      rotationDeg: Number(form.get('rotationDeg') ?? 0),
      color: String(form.get('color') ?? '') || undefined,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    });
    const settings = await getBulletinBoardSettings();
    return new Response(JSON.stringify({ ok: true, pin: serializePin(pin, settings.draftSurface) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not place on board.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
