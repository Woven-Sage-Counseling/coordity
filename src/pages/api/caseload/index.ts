import type { APIRoute } from 'astro';
import { canSeeCaseload, caseloadUtilizationPercent, getCaseloadSnapshot } from '../../../lib/caseload';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active' || !canSeeCaseload(employee)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const snapshot = getCaseloadSnapshot(employee.id);
  return new Response(
    JSON.stringify({
      ok: true,
      weekLabel: snapshot.weekLabel,
      sessionsThisWeek: snapshot.sessionsThisWeek,
      sessionsRemainingThisWeek: snapshot.sessionsRemainingThisWeek,
      activeClients: snapshot.activeClients,
      newClientsThisMonth: snapshot.newClientsThisMonth,
      intakesPending: snapshot.intakesPending,
      caseloadTarget: snapshot.caseloadTarget,
      utilization: caseloadUtilizationPercent(snapshot),
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
