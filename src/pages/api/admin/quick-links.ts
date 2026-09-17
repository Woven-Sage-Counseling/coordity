import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgIdFromLocals } from '../../../lib/organization';
import {
  addQuickLinkFromCatalog,
  createQuickLink,
  deleteQuickLink,
  updateQuickLink,
  type QuickLinkCategory,
} from '../../../lib/quick-links';

export const prerender = false;

function redirectOk(): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin?quickLinksSaved=1#quick-links', 'Cache-Control': 'no-store' },
  });
}

function parseCategory(raw: string): QuickLinkCategory {
  if (
    raw === 'clinical' ||
    raw === 'billing' ||
    raw === 'business' ||
    raw === 'financial' ||
    raw === 'internal'
  ) {
    return raw;
  }
  return 'business';
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();
  const action = String(form.get('action') ?? '').trim();
  const roleKeys = form
    .getAll('roleKeys')
    .map((value) => String(value).trim())
    .filter(Boolean);

  try {
    if (action === 'add-from-catalog') {
      await addQuickLinkFromCatalog({
        orgId,
        catalogKey: String(form.get('catalogKey') ?? '').trim(),
        roleKeys: roleKeys.length > 0 ? roleKeys : undefined,
      });
      return redirectOk();
    }

    if (action === 'create-custom') {
      await createQuickLink({
        orgId,
        name: String(form.get('name') ?? ''),
        href: String(form.get('href') ?? ''),
        description: String(form.get('description') ?? ''),
        category: parseCategory(String(form.get('category') ?? 'business')),
        iconSrc: String(form.get('iconSrc') ?? '').trim() || null,
        roleKeys,
        enabled: String(form.get('enabled') ?? '1') === '1',
      });
      return redirectOk();
    }

    if (action === 'update-custom') {
      const linkId = String(form.get('linkId') ?? '').trim();
      await updateQuickLink({
        orgId,
        linkId,
        name: String(form.get('name') ?? ''),
        href: String(form.get('href') ?? ''),
        description: String(form.get('description') ?? ''),
        category: parseCategory(String(form.get('category') ?? 'business')),
        iconSrc: String(form.get('iconSrc') ?? '').trim() || null,
        roleKeys,
        enabled: String(form.get('enabled') ?? '') === '1',
      });
      return redirectOk();
    }

    if (action === 'delete-custom') {
      await deleteQuickLink(orgId, String(form.get('linkId') ?? '').trim());
      return redirectOk();
    }

    throw new Error('Unknown action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save quick links.';
    return formErrorRedirect('/admin', message, 'quickLinksError');
  }
};
