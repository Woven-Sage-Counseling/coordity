import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgIdFromLocals } from '../../../lib/organization';
import {
  NEW_ROLE_ASSIGNMENT_SURFACES,
  createOrganizationRole,
  deleteOrganizationRole,
  findRoleUsage,
  roleUsageIsEmpty,
  updateOrganizationRole,
} from '../../../lib/org-roles';

export const prerender = false;

function redirectOk(extra?: Record<string, string>): Response {
  const params = new URLSearchParams({ rolesSaved: '1', ...(extra ?? {}) });
  return new Response(null, {
    status: 303,
    headers: { Location: `/admin?${params.toString()}#roles`, 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;

  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();
  const action = String(form.get('action') ?? '').trim();
  const permissions = form
    .getAll('permissions')
    .map((value) => String(value).trim())
    .filter(Boolean);

  try {
    if (action === 'create') {
      const created = await createOrganizationRole({
        orgId,
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
        permissions,
      });
      return redirectOk({
        roleCreated: '1',
        roleName: created.name,
        roleSurfaces: NEW_ROLE_ASSIGNMENT_SURFACES.join('|'),
      });
    }

    if (action === 'update') {
      await updateOrganizationRole({
        orgId,
        roleId: String(form.get('roleId') ?? '').trim(),
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
        ...(form.has('permissionsConfigured') ? { permissions } : {}),
      });
      return redirectOk();
    }

    if (action === 'delete') {
      const roleId = String(form.get('roleId') ?? '').trim();
      try {
        await deleteOrganizationRole(orgId, roleId);
        return redirectOk();
      } catch (error) {
        if (error instanceof Error && error.message === 'ROLE_IN_USE') {
          const key = String(form.get('roleKey') ?? '').trim();
          const usage = await findRoleUsage(orgId, key);
          const parts: string[] = [];
          if (usage.people > 0) {
            parts.push(
              `${usage.people} people${usage.peopleNames.length ? ` (${usage.peopleNames.join(', ')})` : ''}`,
            );
          }
          if (usage.invites > 0) parts.push(`${usage.invites} pending invite(s)`);
          if (usage.trainingModules.length > 0) {
            parts.push(
              `Training modules: ${usage.trainingModules.map((m) => m.title).join(', ')}`,
            );
          }
          if (usage.trainingLessons.length > 0) {
            parts.push(
              `Lessons/assignments: ${usage.trainingLessons.map((l) => l.title).join(', ')}`,
            );
          }
          if (usage.quickLinks.length > 0) {
            parts.push(`Quick links: ${usage.quickLinks.map((l) => l.name).join(', ')}`);
          }
          return formErrorRedirect(
            '/admin',
            `This role is being used in: ${parts.join(' · ')}. Reassign or remove those first.`,
            'rolesError',
          );
        }
        throw error;
      }
    }

    if (action === 'usage') {
      // JSON usage helper for optional client modal
      const roleKey = String(form.get('roleKey') ?? '').trim();
      const usage = await findRoleUsage(orgId, roleKey);
      return new Response(JSON.stringify({ ok: true, empty: roleUsageIsEmpty(usage), usage }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }

    throw new Error('Unknown action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save role.';
    return formErrorRedirect('/admin', message, 'rolesError');
  }
};
