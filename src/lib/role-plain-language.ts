/** Plain-language labels for roles and permissions shown on the Management page. */

export const permissionPlainLanguage: Record<string, string> = {
  'portal:access': 'Can sign in to the employee portal',
  'account:view': 'Can view and update their own profile',
  'resources:view': 'Can open the Resources page',
  'resources:manage': 'Can add or change employee resources',
  'apps:clinical': 'Can open clinical and billing apps (like SimplePractice, Headway, Availity)',
  'apps:management': 'Can open business tools (like Quo and Dropbox Fax)',
  'financials:view': 'Can view the financial dashboard and cash numbers',
  'financials:manage': 'Can connect QuickBooks and sync financial data',
  'employees:view': 'Can see the People list and who has which role',
  'employees:manage': 'Can invite people, change roles, and disable accounts',
};

export const rolePlainLanguage: Record<string, { summary: string; can: string[]; cannot?: string[] }> = {
  owner: {
    summary: 'Full control of the practice portal.',
    can: [
      'Do everything listed for other roles',
      'Invite and manage people',
      'Post announcements',
      'Connect and sync QuickBooks',
      'See financials and every tool',
    ],
  },
  owner_view: {
    summary: 'Can see almost everything, but cannot make administrative changes.',
    can: [
      'Sign in and use clinical, billing, and business tools',
      'View financials',
      'View the People list',
      'Post and remove announcements',
    ],
    cannot: [
      'Invite or change people’s roles',
      'Connect or sync QuickBooks',
    ],
  },
  finance: {
    summary: 'Focused on money and clinical tools.',
    can: [
      'Sign in and open clinical and billing apps',
      'View the financial dashboard',
      'Open Resources',
    ],
    cannot: [
      'Manage people',
      'Connect QuickBooks',
      'Open business tools like Quo',
    ],
  },
  manager: {
    summary: 'Day-to-day operations without full owner powers.',
    can: [
      'Sign in and open clinical and billing apps',
      'Open business tools like Quo and Dropbox Fax',
      'Open Resources',
    ],
    cannot: [
      'View financials',
      'Manage people',
      'Post announcements (owners only)',
    ],
  },
  clinician: {
    summary: 'For therapists and clinicians doing client work.',
    can: [
      'Sign in',
      'Open clinical and billing apps',
      'Open Resources',
    ],
    cannot: [
      'View financials',
      'Open business-management tools',
      'Manage people or announcements',
    ],
  },
  employee: {
    summary: 'General staff access without clinical systems.',
    can: [
      'Sign in',
      'Open Resources',
      'Update their own profile',
    ],
    cannot: [
      'Open clinical or billing apps',
      'View financials',
      'Manage people or announcements',
    ],
  },
  intern: {
    summary: 'For supervised interns who need clinical tools.',
    can: [
      'Sign in',
      'Open clinical and billing apps',
      'Open Resources',
    ],
    cannot: [
      'View financials',
      'Open business-management tools',
      'Manage people or announcements',
    ],
  },
};

export function plainPermission(key: string, fallback?: string): string {
  return permissionPlainLanguage[key] ?? fallback ?? key;
}

export function plainRole(key: string) {
  return rolePlainLanguage[key] ?? null;
}
