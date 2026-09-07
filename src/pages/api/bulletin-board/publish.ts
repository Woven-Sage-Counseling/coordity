import type { APIRoute } from 'astro';
import {
  BULLETIN_AUTHOR_COLORS,
  listBulletinBoardPins,
  publishBulletinBoard,
  serializePin,
  writingModeForSurface,
} from '../../../lib/bulletin-board';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgIdFromLocals } from '../../../lib/organization';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

  try {
    const settings = await publishBulletinBoard(orgIdFromLocals(locals.organization));
    const pins = (await listBulletinBoardPins({ channel: 'live' })).map((pin) =>
      serializePin(pin, settings.surface),
    );
    return new Response(
      JSON.stringify({
        ok: true,
        surface: settings.surface,
        draftSurface: settings.draftSurface,
        writingMode: writingModeForSurface(settings.surface),
        colors: BULLETIN_AUTHOR_COLORS,
        pins,
        publishedAt: settings.publishedAt,
        draftUpdatedAt: settings.draftUpdatedAt,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update the live board.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
