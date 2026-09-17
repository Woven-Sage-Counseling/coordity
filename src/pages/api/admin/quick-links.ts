import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgIdFromLocals } from '../../../lib/organization';
import {
  addQuickLinkFromCatalog,
  createQuickLink,
  createQuickLinkCategory,
  deleteQuickLink,
  deleteQuickLinkCategory,
  moveQuickLinkCategory,
  updateQuickLink,
  updateQuickLinkCategory,
} from '../../../lib/quick-links';

export const prerender = false;

function redirectOk(): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin?quickLinksSaved=1#quick-links', 'Cache-Control': 'no-store' },
  });
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
        categoryId: String(form.get('categoryId') ?? '').trim() || undefined,
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
        categoryId: String(form.get('categoryId') ?? '').trim(),
        iconSrc: String(form.get('iconSrc') ?? '').trim() || null,
        roleKeys,
        enabled: String(form.get('enabled') ?? '1') === '1',
      });
      return redirectOk();
    }

    if (action === 'update-custom') {
      await updateQuickLink({
        orgId,
        linkId: String(form.get('linkId') ?? '').trim(),
        name: String(form.get('name') ?? ''),
        href: String(form.get('href') ?? ''),
        description: String(form.get('description') ?? ''),
        categoryId: String(form.get('categoryId') ?? '').trim(),
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

    if (action === 'create-category') {
      await createQuickLinkCategory({
        orgId,
        title: String(form.get('title') ?? ''),
      });
      return redirectOk();
    }

    if (action === 'update-category') {
      await updateQuickLinkCategory({
        orgId,
        categoryId: String(form.get('categoryId') ?? '').trim(),
        title: String(form.get('title') ?? ''),
      });
      return redirectOk();
    }

    if (action === 'move-category') {
      const direction = String(form.get('direction') ?? '').trim();
      if (direction !== 'up' && direction !== 'down') throw new Error('Invalid move direction.');
      await moveQuickLinkCategory({
        orgId,
        categoryId: String(form.get('categoryId') ?? '').trim(),
        direction,
      });
      return redirectOk();
    }

    if (action === 'delete-category') {
      await deleteQuickLinkCategory({
        orgId,
        categoryId: String(form.get('categoryId') ?? '').trim(),
        moveLinksToCategoryId: String(form.get('moveLinksToCategoryId') ?? '').trim() || undefined,
      });
      return redirectOk();
    }

    throw new Error('Unknown action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save quick links.';
    return formErrorRedirect('/admin', message, 'quickLinksError');
  }
};
