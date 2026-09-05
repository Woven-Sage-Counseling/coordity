import type { APIRoute } from 'astro';
import { isBulletinSurface, type BulletinSurface } from '../../../lib/bulletin-board';
import {
  getHomeUserPrefs,
  serializeHomeUserPrefs,
  updateHomeUserPrefs,
} from '../../../lib/home-user-prefs';
import { isBelowSlot, isRailSlot, type HomeBelowSlot, type HomeRailSlot } from '../../../lib/home-layout';
import { DEFAULT_ORG_ID } from '../../../lib/organization';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const prefs = await getHomeUserPrefs(employee.id, DEFAULT_ORG_ID);
  return new Response(JSON.stringify({ ok: true, prefs: serializeHomeUserPrefs(prefs) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const form = await request.formData();

  try {
    const surfaceRaw = String(form.get('surfaceOverride') ?? '').trim();
    const railRaw = String(form.get('railSlot') ?? '').trim();
    const belowRaw = String(form.get('belowSlot') ?? '').trim();

    let surfaceOverride: BulletinSurface | null | '' = '';
    if (form.has('surfaceOverride')) {
      if (!surfaceRaw || surfaceRaw === 'default') surfaceOverride = null;
      else if (isBulletinSurface(surfaceRaw)) surfaceOverride = surfaceRaw;
      else throw new Error('Choose a valid board style.');
    }

    let railSlot: HomeRailSlot | null | '' = '';
    if (form.has('railSlot')) {
      if (!railRaw || railRaw === 'default') railSlot = null;
      else if (isRailSlot(railRaw)) railSlot = railRaw;
      else throw new Error('Choose a valid right-rail option.');
    }

    let belowSlot: HomeBelowSlot | null | '' = '';
    if (form.has('belowSlot')) {
      if (!belowRaw || belowRaw === 'default') belowSlot = null;
      else if (isBelowSlot(belowRaw)) belowSlot = belowRaw;
      else throw new Error('Choose a valid underneath option.');
    }

    const prefs = await updateHomeUserPrefs({
      userId: employee.id,
      surfaceOverride: form.has('surfaceOverride') ? surfaceOverride : undefined,
      railSlot: form.has('railSlot') ? railSlot : undefined,
      belowSlot: form.has('belowSlot') ? belowSlot : undefined,
    });

    return new Response(JSON.stringify({ ok: true, prefs: serializeHomeUserPrefs(prefs) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save home preferences.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
