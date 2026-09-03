import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../../lib/permissions';
import { updateWorkCategory } from '../../../../lib/timesheet-work-categories';
import { workCategoriesAdminError, workCategoriesAdminRedirect } from '../../../../lib/work-categories-http';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  if (!canAccessManagement(locals.employee)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  try {
    await updateWorkCategory({
      id: String(form.get('id') ?? '').trim(),
      label: String(form.get('label') ?? ''),
      color: String(form.get('color') ?? ''),
    });
  } catch (error) {
    return workCategoriesAdminError(error instanceof Error ? error.message : 'Could not update work item.');
  }

  return workCategoriesAdminRedirect(true);
};
