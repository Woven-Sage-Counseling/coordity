import type { APIRoute } from 'astro';
import { groupDirectoryByTeam, listDirectory, listDirectoryClinicians } from '../../../lib/employees';
import { orgIdFromLocals } from '../../../lib/organization';
import { listUsersOnApprovedTimeOffNow } from '../../../lib/time-off-requests';
import { listActiveShiftUserIds, listOnBreakUserIds } from '../../../lib/timesheet-entries';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const orgId = orgIdFromLocals(locals.organization);
  const people = await listDirectory(orgId);
  const [onShift, onBreak, traveling, clinicians] = await Promise.all([
    listActiveShiftUserIds(),
    listOnBreakUserIds(),
    listUsersOnApprovedTimeOffNow(),
    listDirectoryClinicians(orgId),
  ]);
  const clinicianIds = new Set(clinicians.map((person) => person.id));

  const serialize = (person: (typeof people)[number]) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    jobTitle: person.jobTitle ?? '',
    phone: person.phone ?? '',
    hasAvatar: person.hasAvatar,
    onShift: onShift.has(person.id),
    onBreak: onBreak.has(person.id),
    onTimeOff: traveling.has(person.id),
    clinician: clinicianIds.has(person.id),
  });

  if (people.length === 0) {
    return new Response(JSON.stringify({ ok: true, groups: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const grouped = groupDirectoryByTeam(people);
  const groups = [
    ...grouped.groups.map((group) => ({
      id: group.id,
      name: group.name,
      people: group.people.map(serialize),
    })),
    ...(grouped.unassigned.length > 0
      ? [
          {
            id: 'unassigned',
            name: 'Unassigned',
            people: grouped.unassigned.map(serialize),
          },
        ]
      : []),
  ];

  return new Response(JSON.stringify({ ok: true, groups }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
