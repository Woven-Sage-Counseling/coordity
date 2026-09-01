import { canSeeCaseload } from './caseload';
import { canSeeCredentialing } from './credentialing';
import { canUseTimesheet } from './timesheet-access';
import type { HomeWidgetId } from './home-widgets';

export interface PortalTool {
  widgetId: HomeWidgetId;
  label: string;
  description: string;
  href: string;
  requiresCredentialing?: boolean;
  requiresClinical?: boolean;
  requiresTimesheet?: boolean;
}

export const PORTAL_TOOLS: PortalTool[] = [
  {
    widgetId: 'tasks',
    label: 'Tasks',
    description: 'Personal to-dos and tasks assigned by admins.',
    href: '/tasks',
  },
  {
    widgetId: 'credentialing',
    label: 'Credentialing',
    description: 'Look up accepted and in-progress insurance coverage.',
    href: '/credentialing',
    requiresCredentialing: true,
  },
  {
    widgetId: 'caseload',
    label: 'Caseload',
    description: 'Sessions this week, active clients, and caseload fill.',
    href: '/caseload',
    requiresClinical: true,
  },
  {
    widgetId: 'time_off',
    label: 'Request time off',
    description: 'Submit time-off requests and track approval status.',
    href: '/time-off',
  },
  {
    widgetId: 'timesheet',
    label: 'Timesheet',
    description: 'Clock in and out, log hours, and review your shift log.',
    href: '/timesheet',
    requiresTimesheet: true,
  },
  {
    widgetId: 'my_progress',
    label: 'My progress',
    description: 'Onboarding, training, and compliance progress.',
    href: '/progress',
  },
];

export function availablePortalTools(employee: PortalEmployee): PortalTool[] {
  const canCredentialing = canSeeCredentialing(employee);
  const canClinical = canSeeCaseload(employee);
  const canTimesheet = canUseTimesheet(employee);

  return PORTAL_TOOLS.filter((tool) => {
    if (tool.requiresCredentialing && !canCredentialing) return false;
    if (tool.requiresClinical && !canClinical) return false;
    if (tool.requiresTimesheet && !canTimesheet) return false;
    return true;
  });
}
