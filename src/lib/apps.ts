import type { Permission } from './permissions';

export interface PortalApp {
  id: string;
  name: string;
  category: 'clinical' | 'business' | 'financial' | 'internal';
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
    iconSrc: '/app-icons/quickbooks.png',
  },
  {
    id: 'bankofamerica',
    name: 'Bank of America',
    category: 'financial',
    description: 'Open Bank of America for the practice reserve account.',
    href: 'https://www.bankofamerica.com',
    external: true,
    permission: 'financials:view',
    iconSrc: '/app-icons/bankofamerica.png',
  },
  {
    id: 'relay',
    name: 'Relay',
    category: 'financial',
    description: 'Open Relay for operating cash and revolving business expenses.',
    href: 'https://bank.relayfi.com',
    external: true,
    permission: 'financials:view',
    iconSrc: '/app-icons/relay.png',
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
  {
    id: 'financial',
    title: 'Financial tools',
    intro: 'Banking for the Bank of America reserve and Relay operating cash.',
  },
];
