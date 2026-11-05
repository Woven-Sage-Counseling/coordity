import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      profile: {
        name: employee.name,
        email: employee.email,
        phone: employee.phone ?? '',
        jobTitle: employee.jobTitle ?? '',
        teams: employee.teams,
        roles: employee.roles,
        status: employee.status,
        hasAvatar: employee.hasAvatar,
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
