import type { Permission } from './permissions';

export interface PortalApp {
  id: string;
  name: string;
  category: 'clinical' | 'business' | 'internal';
  description: string;
  href: string;
  external: boolean;
  permission: Permission;
  iconSrc?: string;
}

export const portalApps: PortalApp[] = [
  {
    id: 'simplepractice',
    name: 'SimplePractice',
    category: 'clinical',
    description:
      'Open the SimplePractice clinician workspace for scheduling and clinical records. This portal does not store patient information.',
    href: 'https://secure.simplepractice.com',
    external: true,
    permission: 'apps:clinical',
    iconSrc: '/app-icons/simplepractice.png',
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    category: 'business',
    description: 'Open QuickBooks Online, the source of truth for practice financials.',
    href: 'https://app.qbo.intuit.com',
    external: true,
    permission: 'financials:view',
  },
];

export const appCategories: { id: PortalApp['category']; title: string; intro: string }[] = [
  {
    id: 'clinical',
    title: 'Clinical tools',
    intro: 'Clinical notes, diagnoses, and appointments stay in SimplePractice — never in this portal.',
  },
  {
    id: 'business',
    title: 'Business tools',
    intro: 'Accounting and operations tools for approved finance and ownership roles.',
  },
];
