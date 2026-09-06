import type { APIRoute } from 'astro';
import {
  getHomeLayoutSettings,
  HOME_LAYOUT_IMAGE_MAX_BYTES,
  isBelowSlot,
  isRailSlot,
  serializeHomeLayout,
  updateHomeLayout,
  type HomeBelowSlot,
  type HomeRailSlot,
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

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

  const form = await request.formData();
  const belowSlotRaw = String(form.get('belowSlot') ?? 'none').trim();
  const railSlotRaw = String(form.get('railSlot') ?? 'none').trim();
  const clearRailImage = ['1', 'true', 'on', 'yes'].includes(
    String(form.get('clearRailImage') ?? '')
      .trim()
      .toLowerCase(),
  );
  const file = form.get('railImage');

  try {
    if (!isBelowSlot(belowSlotRaw)) {
      throw new Error('Choose a valid bottom header option.');
    }
    if (!isRailSlot(railSlotRaw)) {
      throw new Error('Choose a valid right header option.');
    }

    const belowSlot = belowSlotRaw as HomeBelowSlot;
    const railSlot = railSlotRaw as HomeRailSlot;

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

    // Touch read so missing rows are ensured before update.
    await getHomeLayoutSettings();

    const updated = await updateHomeLayout({
      railSlot,
      belowSlot,
      railImageMime,
      railImageData,
      clearRailImage,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        layout: serializeHomeLayout(updated),
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
