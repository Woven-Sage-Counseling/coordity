import type { APIRoute } from 'astro';
import { serializeTask, updateTaskTitle } from '../../../lib/tasks';
import { tasksErrorResponse, tasksJsonOk, wantsJson } from '../../../lib/tasks-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const taskId = String(form.get('taskId') ?? '').trim();
  const title = String(form.get('title') ?? '').trim();

  if (!taskId) {
    return tasksErrorResponse(request, form, 'Task not found.');
  }

  let task;
  try {
    task = await updateTaskTitle(taskId, employee.id, title);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update that task.';
    return tasksErrorResponse(request, form, message);
  }

  if (wantsJson(request)) {
    return tasksJsonOk({ task: serializeTask(task) });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/' },
  });
};
