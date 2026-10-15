import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../lib/permissions';
import { orgIdFromLocals } from '../../../lib/organization';
import { createQuickLink, listQuickLinkCategories, listVisibleQuickLinks } from '../../../lib/quick-links';

export const prerender = false;

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
  try {
    const [links, categories] = await Promise.all([
      listVisibleQuickLinks({ orgId, roleKeys: employee.roles ?? [] }),
      listQuickLinkCategories(orgId),
    ]);
    return json({
      ok: true,
      canManage: canAccessManagement(employee),
      categories: categories.map((category) => ({ id: category.id, title: category.title })),
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

  const body = (await request.json().catch(() => null)) as { name?: string; href?: string; categoryId?: string } | null;
  const orgId = orgIdFromLocals(locals.organization);
  try {
    const categories = await listQuickLinkCategories(orgId);
    const categoryId = body?.categoryId?.trim() || categories[0]?.id;
    if (!categoryId) return json({ error: 'Add a category on the website first.' }, 400);
    const link = await createQuickLink({
      orgId,
      name: body?.name ?? '',
      href: body?.href ?? '',
      categoryId,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The link was not saved.';
    return json({ error: message }, 400);
  }
};
