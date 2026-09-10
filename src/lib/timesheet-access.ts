import { isClinicianEmployee } from './employees';

export function canUseTimesheet(employee: PortalEmployee | null): boolean {
  if (!employee || employee.status !== 'active') return false;
  return !isClinicianEmployee(employee);
}

export function timesheetForbiddenResponse(): Response {
  return new Response('Forbidden', { status: 403 });
}

export function requireTimesheetAccess(employee: PortalEmployee | null): Response | null {
  if (!employee || employee.status !== 'active') return timesheetForbiddenResponse();
  if (!canUseTimesheet(employee)) return timesheetForbiddenResponse();
  return null;
}
