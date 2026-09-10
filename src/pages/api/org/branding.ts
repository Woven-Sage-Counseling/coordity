import type { APIRoute } from 'astro';
import { requireManagementAccess } from '../../../lib/management-access';
import {
  orgIdFromLocals,
  serializeOrganizationBranding,
  updateOrganizationBranding,
} from '../../../lib/organization';

export const prerender = false;

function formColor(form: FormData, key: string): string | null {
  return String(form.get(key) ?? '').trim() || null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

  const form = await request.formData();
  const clearLogo = ['1', 'true', 'on', 'yes'].includes(
    String(form.get('clearLogo') ?? '')
      .trim()
      .toLowerCase(),
  );
  const clearFavicon = ['1', 'true', 'on', 'yes'].includes(
    String(form.get('clearFavicon') ?? '')
      .trim()
      .toLowerCase(),
  );
  const invertLogoDark = ['1', 'true', 'on', 'yes'].includes(
    String(form.get('invertLogoDark') ?? '')
      .trim()
      .toLowerCase(),
  );
  const logoFile = form.get('logo');
  const faviconFile = form.get('favicon');

  try {
    const org = await updateOrganizationBranding({
      orgId: orgIdFromLocals(locals.organization),
      displayName: String(form.get('displayName') ?? ''),
      websiteUrl: String(form.get('websiteUrl') ?? ''),
      bgColorLight: formColor(form, 'bgColorLight'),
      primaryColorLight: formColor(form, 'primaryColorLight'),
      accentColorLight: formColor(form, 'accentColorLight'),
      bgColorDark: formColor(form, 'bgColorDark'),
      primaryColorDark: formColor(form, 'primaryColorDark'),
      accentColorDark: formColor(form, 'accentColorDark'),
      invertLogoDark,
      logoFile: logoFile instanceof File ? logoFile : null,
      clearLogo,
      faviconFile: faviconFile instanceof File ? faviconFile : null,
      clearFavicon,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        branding: serializeOrganizationBranding(org),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save branding.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
