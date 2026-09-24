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
      surfaceColorLight: formColor(form, 'surfaceColorLight'),
      textColorLight: formColor(form, 'textColorLight'),
      primaryColorLight: formColor(form, 'primaryColorLight'),
      primaryTextColorLight: formColor(form, 'primaryTextColorLight'),
      primaryHoverColorLight: formColor(form, 'primaryHoverColorLight'),
      accentColorLight: formColor(form, 'accentColorLight'),
      accentTextColorLight: formColor(form, 'accentTextColorLight'),
      accentHoverColorLight: formColor(form, 'accentHoverColorLight'),
      shadowColorLight: formColor(form, 'shadowColorLight'),
      shadowTextColorLight: formColor(form, 'shadowTextColorLight'),
      shadowHoverColorLight: formColor(form, 'shadowHoverColorLight'),
      selectedColorLight: formColor(form, 'selectedColorLight'),
      selectedTextColorLight: formColor(form, 'selectedTextColorLight'),
      selectedHoverColorLight: formColor(form, 'selectedHoverColorLight'),
      widgetHeaderColorLight: formColor(form, 'widgetHeaderColorLight'),
      widgetBgColorLight: formColor(form, 'widgetBgColorLight'),
      widgetCardColorLight: formColor(form, 'widgetCardColorLight'),
      widgetButtonColorLight: formColor(form, 'widgetButtonColorLight'),
      widgetButtonTextColorLight: formColor(form, 'widgetButtonTextColorLight'),
      widgetButtonHoverColorLight: formColor(form, 'widgetButtonHoverColorLight'),
      widgetOutlineColorLight: formColor(form, 'widgetOutlineColorLight'),
      widgetOutlineTextColorLight: formColor(form, 'widgetOutlineTextColorLight'),
      widgetOutlineHoverColorLight: formColor(form, 'widgetOutlineHoverColorLight'),
      bgColorDark: formColor(form, 'bgColorDark'),
      surfaceColorDark: formColor(form, 'surfaceColorDark'),
      textColorDark: formColor(form, 'textColorDark'),
      primaryColorDark: formColor(form, 'primaryColorDark'),
      primaryTextColorDark: formColor(form, 'primaryTextColorDark'),
      primaryHoverColorDark: formColor(form, 'primaryHoverColorDark'),
      accentColorDark: formColor(form, 'accentColorDark'),
      accentTextColorDark: formColor(form, 'accentTextColorDark'),
      accentHoverColorDark: formColor(form, 'accentHoverColorDark'),
      shadowColorDark: formColor(form, 'shadowColorDark'),
      shadowTextColorDark: formColor(form, 'shadowTextColorDark'),
      shadowHoverColorDark: formColor(form, 'shadowHoverColorDark'),
      selectedColorDark: formColor(form, 'selectedColorDark'),
      selectedTextColorDark: formColor(form, 'selectedTextColorDark'),
      selectedHoverColorDark: formColor(form, 'selectedHoverColorDark'),
      widgetHeaderColorDark: formColor(form, 'widgetHeaderColorDark'),
      widgetBgColorDark: formColor(form, 'widgetBgColorDark'),
      widgetCardColorDark: formColor(form, 'widgetCardColorDark'),
      widgetButtonColorDark: formColor(form, 'widgetButtonColorDark'),
      widgetButtonTextColorDark: formColor(form, 'widgetButtonTextColorDark'),
      widgetButtonHoverColorDark: formColor(form, 'widgetButtonHoverColorDark'),
      widgetOutlineColorDark: formColor(form, 'widgetOutlineColorDark'),
      widgetOutlineTextColorDark: formColor(form, 'widgetOutlineTextColorDark'),
      widgetOutlineHoverColorDark: formColor(form, 'widgetOutlineHoverColorDark'),
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
