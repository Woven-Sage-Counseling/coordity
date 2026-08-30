import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../lib/permissions';
import { deleteTask } from '../../../lib/tasks';
import {
  resolveTasksReturnTo,
  tasksErrorResponse,
  tasksJsonOk,
  wantsJson,
} from '../../../lib/tasks-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const taskId = String(form.get('taskId') ?? '').trim();

  if (!taskId) {
    return tasksErrorResponse(request, form, 'Task not found.');
  }

  try {
    await deleteTask(taskId, employee.id, canAccessManagement(employee));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete that task.';
    return tasksErrorResponse(request, form, message);
  }

  if (wantsJson(request)) {
    return tasksJsonOk({ taskId });
  }

  const returnTo = resolveTasksReturnTo(form, '/');
  return new Response(null, {
    status: 303,
    headers: { Location: returnTo },
  });
};
