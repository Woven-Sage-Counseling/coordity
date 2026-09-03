import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../../lib/permissions';
import { createWorkCategory } from '../../../../lib/timesheet-work-categories';
import { workCategoriesAdminError, workCategoriesAdminRedirect } from '../../../../lib/work-categories-http';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  if (!canAccessManagement(locals.employee)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  try {
    await createWorkCategory({
      label: String(form.get('label') ?? ''),
      color: String(form.get('color') ?? '#475569'),
    });
  } catch (error) {
    return workCategoriesAdminError(error instanceof Error ? error.message : 'Could not add work item.');
  }

  return workCategoriesAdminRedirect(true);
};
