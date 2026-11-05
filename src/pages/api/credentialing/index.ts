import type { APIRoute } from 'astro';
import { canSeeCredentialing, listPublicInsuranceDisplay } from '../../../lib/credentialing';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active' || !canSeeCredentialing(employee)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const groups = await listPublicInsuranceDisplay();
  return new Response(
    JSON.stringify({
      ok: true,
      groups: groups.map((group) => ({
        id: group.groupId,
        name: group.groupName,
        inNetworkPlans: group.inNetworkPlans.map((plan) => plan.planName),
        comingSoonPlans: group.comingSoonPlans.map((plan) => plan.planName),
        inNetworkAtNetworkLevel: group.inNetworkAtNetworkLevel === true,
        comingSoonAtNetworkLevel: group.credentialingAtNetworkLevel === true,
      })),
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
