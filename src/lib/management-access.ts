import { canAccessManagement } from './permissions';

export function requireManagementAccess(employee: PortalEmployee | null): Response | null {
  if (!employee || employee.status !== 'active' || !canAccessManagement(employee)) {
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}
