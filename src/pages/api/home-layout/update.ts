import type { APIRoute } from 'astro';
import {
  getHomeLayoutSettings,
  HOME_LAYOUT_IMAGE_MAX_BYTES,
  reflowBoardPinsForShape,
  serializeHomeLayout,
  updateHomeLayout,
  type HomeBelowSlot,
  type HomeRailImageKind,
} from '../../../lib/home-layout';
import { requireManagementAccess } from '../../../lib/management-access';

export const prerender = false;

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function parseBool(value: FormDataEntryValue | null): boolean {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

  const form = await request.formData();
  const belowSlot = String(form.get('belowSlot') ?? 'none').trim() as HomeBelowSlot;
  const railImageKind = String(form.get('railImageKind') ?? 'none').trim() as HomeRailImageKind;
  const clearRailImage = parseBool(form.get('clearRailImage'));
  const file = form.get('railImage');

  try {
    if (!['none', 'board', 'widgets'].includes(belowSlot)) {
      throw new Error('Choose a valid below-area option.');
    }
    if (!['none', 'custom', 'company', 'portal'].includes(railImageKind)) {
      throw new Error('Choose a valid rail image option.');
    }

    const previous = await getHomeLayoutSettings();
    let railImageMime: string | null = null;
    let railImageData: string | null = null;

    if (file instanceof File && file.size > 0) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
        throw new Error('Use a JPEG, PNG, WebP, or GIF image.');
      }
      if (file.size > HOME_LAYOUT_IMAGE_MAX_BYTES) {
        throw new Error('Image is too large (max about 1.2MB).');
      }
      railImageMime = file.type;
      railImageData = await fileToBase64(file);
    }

    const updated = await updateHomeLayout({
      railBoard: parseBool(form.get('railBoard')),
      railWidgets: parseBool(form.get('railWidgets')),
      railImageKind,
      belowSlot,
      railImageMime,
      railImageData,
      clearRailImage,
    });

    if (previous.boardShape !== updated.boardShape) {
      await reflowBoardPinsForShape({
        from: previous.boardShape,
        to: updated.boardShape,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        layout: serializeHomeLayout(updated),
        reflowed: previous.boardShape !== updated.boardShape,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save home layout.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
