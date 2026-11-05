import type { APIRoute } from 'astro';
import { orgIdFromLocals } from '../../../lib/organization';
import { getModuleProgressForUser, moduleVisibleToRoles } from '../../../lib/training';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const moduleId = url.searchParams.get('id') ?? '';
  const progress = await getModuleProgressForUser({
    orgId: orgIdFromLocals(locals.organization),
    moduleId,
    userId: employee.id,
    roleKeys: employee.roles,
  }).catch(() => null);

  if (!progress || !moduleVisibleToRoles(progress.module, employee.roles) || !progress.module.visible) {
    return new Response(JSON.stringify({ error: 'Module not found.' }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const item = (lesson: { id: string; title: string; completed: boolean }) => ({
    id: lesson.id,
    title: lesson.title,
    completed: lesson.completed,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      module: {
        id: progress.module.id,
        title: progress.module.title,
        description: progress.module.description,
        percent: progress.percent,
        complete: progress.complete,
        assignments: progress.assignments.map(item),
        lessons: progress.lessons.map(item),
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
