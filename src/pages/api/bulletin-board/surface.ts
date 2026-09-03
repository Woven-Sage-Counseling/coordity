import type { APIRoute } from 'astro';
import {
  BULLETIN_COLORS,
  isBulletinSurface,
  listBulletinBoardPins,
  serializePin,
  setBulletinBoardSurface,
  writingModeForSurface,
} from '../../../lib/bulletin-board';
import { requirePortalOwner } from '../../../lib/owner-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requirePortalOwner(locals.employee);
  if (denied) return denied;

  const form = await request.formData();
  const surface = String(form.get('surface') ?? '').trim();
  if (!isBulletinSurface(surface)) {
    return new Response(JSON.stringify({ error: 'Choose a valid board surface.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const settings = await setBulletinBoardSurface(surface);
  const pins = (await listBulletinBoardPins()).map((pin) => serializePin(pin, settings.surface));
  return new Response(
    JSON.stringify({
      ok: true,
      surface: settings.surface,
      writingMode: writingModeForSurface(settings.surface),
      colors: BULLETIN_COLORS[settings.surface],
      pins,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
};
