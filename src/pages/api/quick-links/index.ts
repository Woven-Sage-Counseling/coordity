import type { APIRoute } from 'astro';
import { QUICK_LINK_CATALOG, QUICK_LINK_CATALOG_GROUPS } from '../../../lib/apps';
import { listRolesWithPermissions } from '../../../lib/employees';
import { canAccessManagement } from '../../../lib/permissions';
import { orgIdFromLocals } from '../../../lib/organization';
import {
  QUICK_LINK_ICON_MAX_BYTES,
  discoverSiteIcon,
  quickLinkIconPath,
  storeQuickLinkIcon,
} from '../../../lib/quick-link-icons';
import {
  addQuickLinkFromCatalog,
  createQuickLink,
  deleteQuickLink,
  listQuickLinkCategories,
  listQuickLinksForAdmin,
  listVisibleQuickLinks,
  quickLinkAssignableRoles,
  updateQuickLink,
} from '../../../lib/quick-links';

export const prerender = false;

const ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function uploadedIcon(body: { iconMime?: string; iconBase64?: string } | null): { mime: string; data: string } | null {
  const data = body?.iconBase64?.trim() ?? '';
  const mime = body?.iconMime?.trim() ?? '';
  if (!data && !mime) return null;
  if (!ICON_TYPES.has(mime)) throw new Error('Use a PNG, JPEG, WebP, or GIF image.');
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > QUICK_LINK_ICON_MAX_BYTES) throw new Error('Image is too large (max 500KB).');
  return { mime, data };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') return json({ error: 'Unauthorized' }, 401);

  const orgId = orgIdFromLocals(locals.organization);
  const canManage = canAccessManagement(employee);
  try {
    const [links, categories] = await Promise.all([
      listVisibleQuickLinks({ orgId, roleKeys: employee.roles ?? [] }),
      listQuickLinkCategories(orgId),
    ]);
    let catalog: { id: string; title: string; tools: { key: string; name: string; added: boolean }[] }[] = [];
    let roles: { key: string; name: string }[] = [];
    if (canManage) {
      try {
        const [allLinks, roleRows] = await Promise.all([
          listQuickLinksForAdmin(orgId),
          listRolesWithPermissions(orgId),
        ]);
        const added = new Set(allLinks.map((link) => link.catalogKey).filter((key): key is string => Boolean(key)));
        catalog = QUICK_LINK_CATALOG_GROUPS.map((group) => ({
          id: group.id,
          title: group.title,
          tools: QUICK_LINK_CATALOG.filter((item) => item.group === group.id).map((item) => ({
            key: item.key,
            name: item.name,
            added: added.has(item.key),
          })),
        }));
        roles = quickLinkAssignableRoles(roleRows).map((role) => ({ key: role.key, name: role.name }));
      } catch (error) {
        console.error('quick link editor options failed', error);
      }
    }
    return json({
      ok: true,
      canManage,
      categories: categories.map((category) => ({ id: category.id, title: category.title })),
      catalog,
      roles,
      links: links.map((link) => ({
        id: link.id,
        name: link.name,
        description: link.description ?? '',
        href: link.href,
        iconSrc: link.iconSrc ?? null,
        categoryId: link.categoryId,
      })),
    });
  } catch (error) {
    console.error('quick links read failed', error);
    const message = error instanceof Error ? error.message : 'Quick links could not be loaded.';
    return json({ ok: false, error: message, canManage: false, categories: [], links: [] }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') return json({ error: 'Unauthorized' }, 401);
  if (!canAccessManagement(employee)) return json({ error: 'Forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as {
    kind?: string;
    name?: string;
    href?: string;
    categoryId?: string;
    catalogKey?: string;
    roleKeys?: string[];
    iconMime?: string;
    iconBase64?: string;
  } | null;
  const orgId = orgIdFromLocals(locals.organization);
  try {
    const categories = await listQuickLinkCategories(orgId);
    const categoryId = body?.categoryId?.trim() || categories[0]?.id;
    if (!categoryId) return json({ error: 'Add a category on the website first.' }, 400);
    const roleKeys = Array.isArray(body?.roleKeys) ? body.roleKeys.map((key) => String(key)) : [];

    if (body?.kind === 'catalog' || body?.catalogKey) {
      const link = await addQuickLinkFromCatalog({
        orgId,
        catalogKey: body?.catalogKey ?? '',
        categoryId,
        roleKeys,
      });
      return json({
        ok: true,
        link: {
          id: link.id,
          name: link.name,
          description: link.description,
          href: link.href,
          iconSrc: link.iconSrc ?? null,
          categoryId: link.categoryId,
        },
      });
    }

    const href = body?.href ?? '';
    const uploaded = uploadedIcon(body);
    const iconSrc = uploaded ? null : await discoverSiteIcon(href);
    const link = await createQuickLink({
      orgId,
      name: body?.name ?? '',
      href,
      categoryId,
      iconSrc,
      roleKeys,
      enabled: true,
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
    return json({
      ok: true,
      link: {
        id: link.id,
        name: link.name,
        description: link.description,
        href: link.href,
        iconSrc: uploaded ? quickLinkIconPath(link.id, 0) : (link.iconSrc ?? null),
        categoryId: link.categoryId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The link was not saved.';
    return json({ error: message }, 400);
  }
};
