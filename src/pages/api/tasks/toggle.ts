import type { APIRoute } from 'astro';
import { serializeTask, setTaskCompleted } from '../../../lib/tasks';
import { tasksErrorResponse, tasksJsonOk, wantsJson } from '../../../lib/tasks-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const taskId = String(form.get('taskId') ?? '').trim();
  const completedRaw = String(form.get('completed') ?? '1').trim();
  const completed = completedRaw !== '0' && completedRaw !== 'false';

  if (!taskId) {
    return tasksErrorResponse(request, form, 'Task not found.');
  }

  let task;
  try {
    task = await setTaskCompleted(taskId, employee.id, completed);
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
