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
  reorderQuickLinks,
  updateQuickLink,
  updateQuickLinkCategory,
} from '../../../lib/quick-links';
import {
  clearQuickLinkIcon,
  discoverSiteIcon,
  quickLinkIconPath,
  readQuickLinkIconFile,
  storeQuickLinkIcon,
} from '../../../lib/quick-link-icons';

export const prerender = false;

function redirectOk(): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin?quickLinksSaved=1#quick-links', 'Cache-Control': 'no-store' },
  });
}

function isFetchSave(request: Request): boolean {
  return request.headers.get('x-quick-links-fetch') === '1';
}

function finish(request: Request): Response {
  if (!isFetchSave(request)) return redirectOk();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fail(request: Request, message: string): Response {
  if (!isFetchSave(request)) return formErrorRedirect('/admin', message, 'quickLinksError');
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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
        roleKeys,
      });
      return finish(request);
    }

    if (action === 'create-custom') {
      const href = String(form.get('href') ?? '');
      const uploaded = await readQuickLinkIconFile(form.get('icon'));
      const iconSrc = uploaded ? null : await discoverSiteIcon(href);
      const link = await createQuickLink({
        orgId,
        name: String(form.get('name') ?? ''),
        href,
        categoryId: String(form.get('categoryId') ?? '').trim(),
        iconSrc,
        roleKeys,
        enabled: String(form.get('enabled') ?? '1') === '1',
      });
      if (uploaded) {
        try {
          const version = await storeQuickLinkIcon(orgId, link.id, uploaded);
          await updateQuickLink({
            orgId,
            linkId: link.id,
            iconSrc: quickLinkIconPath(link.id, version),
          });
        } catch (error) {
          await deleteQuickLink(orgId, link.id).catch(() => undefined);
          throw error;
        }
      }
      return finish(request);
    }

    if (action === 'update-custom') {
      const linkId = String(form.get('linkId') ?? '').trim();
      const href = String(form.get('href') ?? '');
      const uploaded = await readQuickLinkIconFile(form.get('icon'));
      const useSiteIcon = String(form.get('useSiteIcon') ?? '') === '1';
      let iconSrc: string | null | undefined;
      if (!uploaded && useSiteIcon) {
        await clearQuickLinkIcon(orgId, linkId);
        iconSrc = await discoverSiteIcon(href);
      }
      await updateQuickLink({
        orgId,
        linkId,
        name: String(form.get('name') ?? ''),
        href,
        categoryId: String(form.get('categoryId') ?? '').trim(),
        iconSrc,
        roleKeys,
        enabled: String(form.get('enabled') ?? '') === '1',
      });
      if (uploaded) {
        const version = await storeQuickLinkIcon(orgId, linkId, uploaded);
        await updateQuickLink({
          orgId,
          linkId,
          iconSrc: quickLinkIconPath(linkId, version),
        });
      }
      return finish(request);
    }

    if (action === 'delete-custom') {
      await deleteQuickLink(orgId, String(form.get('linkId') ?? '').trim());
      return finish(request);
    }

    if (action === 'create-category') {
      await createQuickLinkCategory({
        orgId,
        title: String(form.get('title') ?? ''),
      });
      return finish(request);
    }

    if (action === 'update-category') {
      await updateQuickLinkCategory({
        orgId,
        categoryId: String(form.get('categoryId') ?? '').trim(),
        title: String(form.get('title') ?? ''),
      });
      return finish(request);
    }

    if (action === 'move-category') {
      const direction = String(form.get('direction') ?? '').trim();
      if (direction !== 'up' && direction !== 'down') throw new Error('Invalid move direction.');
      await moveQuickLinkCategory({
        orgId,
        categoryId: String(form.get('categoryId') ?? '').trim(),
        direction,
      });
      return finish(request);
    }

    if (action === 'reorder-links') {
      await reorderQuickLinks({
        orgId,
        categoryId: String(form.get('categoryId') ?? '').trim(),
        linkIds: form
          .getAll('linkIds')
          .map((value) => String(value).trim())
          .filter(Boolean),
      });
      return finish(request);
    }

    if (action === 'delete-category') {
      await deleteQuickLinkCategory({
        orgId,
        categoryId: String(form.get('categoryId') ?? '').trim(),
        moveLinksToCategoryId: String(form.get('moveLinksToCategoryId') ?? '').trim() || undefined,
      });
      return finish(request);
    }

    throw new Error('Unknown action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save quick links.';
    return fail(request, message);
  }
};
