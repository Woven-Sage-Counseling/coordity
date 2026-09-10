import { canAccessManagement } from './permissions';

/** Prefer canAccessManagement — kept for older call sites. */
export function requirePortalOwner(employee: PortalEmployee | null): Response | null {
  if (!employee || employee.status !== 'active' || !canAccessManagement(employee)) {
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}
