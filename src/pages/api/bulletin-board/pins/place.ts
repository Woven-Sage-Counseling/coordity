import type { APIRoute } from 'astro';
import {
  getBulletinBoardSettings,
  isBulletinBoardVariant,
  placePinFromRequest,
  serializePin,
  type BulletinBoardVariant,
} from '../../../../lib/bulletin-board';
import { requireManagementAccess } from '../../../../lib/management-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;
  const employee = locals.employee!;

  const form = await request.formData();
  const expiresRaw = String(form.get('expiresAt') ?? '').trim();
  const expiresAt = expiresRaw ? Number(expiresRaw) : null;
  const variantRaw = String(form.get('boardVariant') ?? 'portrait').trim();

  try {
    if (!isBulletinBoardVariant(variantRaw)) {
      throw new Error('Choose tall or wide board.');
    }
    const pin = await placePinFromRequest({
      requestId: String(form.get('requestId') ?? '').trim(),
      createdBy: employee.id,
      xPct: Number(form.get('xPct') ?? 38),
      yPct: Number(form.get('yPct') ?? 36),
      widthPct: Number(form.get('widthPct') ?? 24),
      rotationDeg: Number(form.get('rotationDeg') ?? 0),
      color: String(form.get('color') ?? '') || undefined,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
      boardVariant: variantRaw as BulletinBoardVariant,
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
