import { isPortalOwner } from './permissions';

export function requirePortalOwner(employee: PortalEmployee | null): Response | null {
  if (!employee || employee.status !== 'active' || !isPortalOwner(employee)) {
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}
