import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../lib/permissions';
import { notifyUser } from '../../../lib/notifications';
import { createTask, serializeTask, TASK_ASSIGNED_SOURCE } from '../../../lib/tasks';
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
  const title = String(form.get('title') ?? '').trim();
  const requestedAssignee = String(form.get('assigneeId') ?? employee.id).trim();
  const assigneeId = requestedAssignee || employee.id;
  const isAdminAssign = assigneeId !== employee.id;

  if (isAdminAssign && !canAccessManagement(employee)) {
    return new Response('Forbidden', { status: 403 });
  }

  let task;
  try {
    task = await createTask({
      title,
      assigneeId,
      createdBy: employee.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create that task.';
    return tasksErrorResponse(request, form, message);
  }

  if (isAdminAssign) {
    try {
      await notifyUser({
        userId: assigneeId,
        title: 'New task assigned',
        body: `${employee.name} assigned you a task: ${task.title}`,
        sourceType: TASK_ASSIGNED_SOURCE,
        sourceId: task.id,
      });
    } catch (error) {
      console.error('task assign notify failed', error);
    }
  }

  if (wantsJson(request)) {
    return tasksJsonOk({ task: serializeTask(task) });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: resolveTasksReturnTo(
        form,
        isAdminAssign ? '/admin?tasksSaved=1#tasks' : '/?tasks=created',
      ),
    },
  });
};
