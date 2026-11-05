import type { APIRoute } from 'astro';
import { orgIdFromLocals } from '../../../lib/organization';
import { listModuleProgressForUser } from '../../../lib/training';

export const prerender = false;

function kindLabel(kind: string): string {
  if (kind === 'onboarding') return 'Onboarding';
  if (kind === 'using_coordity') return 'Using Coordity';
  return 'Module';
}

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const modules = await listModuleProgressForUser({
    orgId: orgIdFromLocals(locals.organization),
    userId: employee.id,
    roleKeys: employee.roles,
  }).catch(() => []);

  const overallCompleted = modules.reduce(
    (sum, item) => sum + item.completedLessons + item.completedAssignments,
    0,
  );
  const overallTotal = modules.reduce((sum, item) => sum + item.totalLessons + item.totalAssignments, 0);

  return new Response(
    JSON.stringify({
      ok: true,
      overallPercent: overallTotal === 0 ? 0 : Math.round((overallCompleted / overallTotal) * 100),
      overallCompleted,
      overallTotal,
      modules: modules.map((item) => ({
        id: item.module.id,
        title: item.module.title,
        description: item.module.description,
        kindLabel: kindLabel(item.module.kind),
        percent: item.percent,
        complete: item.complete,
        completedLessons: item.completedLessons,
        totalLessons: item.totalLessons,
      })),
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
