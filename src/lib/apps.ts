import type { Permission } from './permissions';

/** Display grouping on Home / Quick links pages. */
export type PortalAppCategory = 'clinical' | 'billing' | 'business' | 'financial' | 'internal';

export interface PortalApp {
  id: string;
  name: string;
  category: string;
  description: string;
  href: string;
  external: boolean;
  permission: Permission;
  iconSrc?: string;
}

/** Catalog picker groups in Admin (not the same as display categories). */
export type QuickLinkCatalogGroupId =
  | 'ehr'
  | 'billing'
  | 'banking'
  | 'phone'
  | 'fax'
  | 'accounting'
  | 'other';

export interface QuickLinkCatalogItem {
  key: string;
  group: QuickLinkCatalogGroupId;
  name: string;
  /** How the link is grouped on /apps and Home once added. */
  category: PortalAppCategory;
  description: string;
  href: string;
  iconSrc?: string;
  /** Suggested default permission hint for role suggestions (not enforced). */
  suggestedPermission: Permission;
}

export const QUICK_LINK_CATALOG_GROUPS: { id: QuickLinkCatalogGroupId; title: string }[] = [
  { id: 'ehr', title: 'EHR / clinical' },
  { id: 'billing', title: 'Billing / payers' },
  { id: 'banking', title: 'Banking' },
  { id: 'phone', title: 'Phone' },
  { id: 'fax', title: 'Fax' },
  { id: 'accounting', title: 'Accounting' },
  { id: 'other', title: 'Other tools' },
];

/** Optional prebuilt tools — never shown until an admin adds them. */
export const QUICK_LINK_CATALOG: QuickLinkCatalogItem[] = [
  {
    key: 'simplepractice',
    group: 'ehr',
    name: 'SimplePractice',
    category: 'clinical',
    description:
      'Open the SimplePractice clinician workspace for scheduling and clinical records. This portal does not store patient information.',
    href: 'https://secure.simplepractice.com',
    iconSrc: '/app-icons/simplepractice.png',
    suggestedPermission: 'apps:clinical',
  },
  {
    key: 'headway',
    group: 'ehr',
    name: 'Headway',
    category: 'clinical',
    description: 'Open the Headway provider portal for sessions, claims, and client management.',
    href: 'https://sigmund.headway.co',
    iconSrc: '/app-icons/headway.png?v=2',
    suggestedPermission: 'apps:clinical',
  },
  {
    key: 'tava',
    group: 'ehr',
    name: 'Tava',
    category: 'clinical',
    description: 'Open the Tava Health provider portal for scheduling, notes, and billing.',
    href: 'https://app.tavahealth.com',
    iconSrc: '/app-icons/tava.png',
    suggestedPermission: 'apps:clinical',
  },
  {
    key: 'availity',
    group: 'billing',
    name: 'Availity',
    category: 'billing',
    description: 'Open Availity Essentials for eligibility, claims, and payer transactions.',
    href: 'https://essentials.availity.com',
    iconSrc: '/app-icons/availity.png?v=5',
    suggestedPermission: 'apps:clinical',
  },
  {
    key: 'providerexpress',
    group: 'billing',
    name: 'Optum | Provider Express',
    category: 'billing',
    description: 'Open Optum Provider Express for behavioral health authorizations and claims.',
    href: 'https://www.providerexpress.com',
    iconSrc: '/app-icons/optum.png',
    suggestedPermission: 'apps:clinical',
  },
  {
    key: 'optum-payments',
    group: 'billing',
    name: 'Optum Provider Payments Portal',
    category: 'billing',
    description: 'Open Optum Pay to view claim payments, remittances, and electronic payment details.',
    href: 'https://myservices.optumhealthpaymentservices.com',
    iconSrc: '/app-icons/optum-payments.png',
    suggestedPermission: 'apps:clinical',
  },
  {
    key: 'bankofamerica',
    group: 'banking',
    name: 'Bank of America',
    category: 'financial',
    description: 'Open Bank of America for the practice reserve account.',
    href: 'https://www.bankofamerica.com',
    iconSrc: '/app-icons/bankofamerica.png',
    suggestedPermission: 'financials:view',
  },
  {
    key: 'relay',
    group: 'banking',
    name: 'Relay',
    category: 'financial',
    description: 'Open Relay for operating cash and revolving business expenses.',
    href: 'https://app.relayfi.com/login',
    iconSrc: '/app-icons/relay.png',
    suggestedPermission: 'financials:view',
  },
  {
    key: 'quo',
    group: 'phone',
    name: 'Quo',
    category: 'business',
    description: 'Open Quo for the practice business phone, texts, and team inbox.',
    href: 'https://my.quo.com/login',
    iconSrc: '/app-icons/quo.png',
    suggestedPermission: 'apps:management',
  },
  {
    key: 'dropbox-fax',
    group: 'fax',
    name: 'Dropbox Fax',
    category: 'business',
    description: 'Open Dropbox Fax to send and receive practice faxes online.',
    href: 'https://app.hellofax.com',
    iconSrc: '/app-icons/dropbox-fax.png',
    suggestedPermission: 'apps:management',
  },
  {
    key: 'quickbooks',
    group: 'accounting',
    name: 'QuickBooks',
    category: 'business',
    description: 'Open QuickBooks Online, the source of truth for practice financials.',
    href: 'https://app.qbo.intuit.com',
    iconSrc: '/app-icons/quickbooks.png',
    suggestedPermission: 'financials:view',
  },
];

export function getCatalogItem(key: string): QuickLinkCatalogItem | null {
  return QUICK_LINK_CATALOG.find((item) => item.key === key) ?? null;
}

export function catalogItemsForGroup(group: QuickLinkCatalogGroupId): QuickLinkCatalogItem[] {
  return QUICK_LINK_CATALOG.filter((item) => item.group === group);
}

/** @deprecated Prefer QUICK_LINK_CATALOG — kept as a flat list for any legacy references. */
export const portalApps: PortalApp[] = QUICK_LINK_CATALOG.map((item) => ({
  id: item.key,
  name: item.name,
  category: item.category,
  description: item.description,
  href: item.href,
  external: true,
  permission: item.suggestedPermission,
  iconSrc: item.iconSrc,
}));

export const appCategories: { id: PortalAppCategory; title: string }[] = [
  { id: 'clinical', title: 'Clinical tools' },
  { id: 'billing', title: 'Billing tools' },
  { id: 'business', title: 'Business tools' },
  { id: 'financial', title: 'Financial tools' },
  { id: 'internal', title: 'Internal tools' },
];
