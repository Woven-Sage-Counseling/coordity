import type { APIRoute } from 'astro';
import { formatTimeOffRequestEntries } from '../../../lib/time-off';
import {
  formatTimeOffRequestDate,
  listTimeOffRequestsForUser,
  timeOffStatusLabel,
} from '../../../lib/time-off-requests';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const requests = await listTimeOffRequestsForUser(employee.id);
  return new Response(
    JSON.stringify({
      ok: true,
      requests: requests.map((request) => ({
        id: request.id,
        status: request.status,
        statusLabel: timeOffStatusLabel(request.status),
        createdAtLabel: formatTimeOffRequestDate(request.createdAt),
        notes: request.notes ?? '',
        reviewedLabel: request.reviewedAt
          ? `Reviewed ${formatTimeOffRequestDate(request.reviewedAt)}${request.reviewerName ? ` by ${request.reviewerName}` : ''}`
          : '',
        entryLabels: formatTimeOffRequestEntries(
          request.entries.map((entry) => ({
            date: entry.date,
            fullDay: entry.fullDay,
            startTime: entry.startTime,
            endTime: entry.endTime,
          })),
        ),
      })),
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
