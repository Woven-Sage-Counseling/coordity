import type { APIRoute } from 'astro';
import {
  isBulletinBoardMode,
  setBulletinBoardMode,
  type BulletinBoardMode,
} from '../../../lib/bulletin-board';
import { requireManagementAccess } from '../../../lib/management-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

  const form = await request.formData();
  const modeRaw = String(form.get('mode') ?? '').trim();

  try {
    if (!isBulletinBoardMode(modeRaw)) {
      throw new Error('Choose duplicate or separate board mode.');
    }
    const { settings, converted } = await setBulletinBoardMode(modeRaw as BulletinBoardMode);
    return new Response(
      JSON.stringify({
        ok: true,
        boardMode: settings.boardMode,
        converted,
        draftUpdatedAt: settings.draftUpdatedAt,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not change board mode.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
