/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

type PortalPermission =
  | 'portal:access'
  | 'account:view'
  | 'resources:view'
  | 'resources:manage'
  | 'apps:clinical'
  | 'apps:management'
  | 'financials:view'
  | 'financials:manage'
  | 'employees:view'
  | 'employees:manage'
  | 'credentialing:view'
  | 'credentialing:manage';

interface PortalEmployee {
  id: string;
  email: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  teams: string[];
  hasAvatar: boolean;
  status: 'pending' | 'active' | 'disabled';
  roles: string[];
  permissions: PortalPermission[];
}

interface PortalOrganization {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  hasLogo: boolean;
  logoUpdatedAt: number | null;
  hasFavicon: boolean;
  faviconUpdatedAt: number | null;
  bgColorLight: string | null;
  primaryColorLight: string | null;
  accentColorLight: string | null;
  bgColorDark: string | null;
  primaryColorDark: string | null;
  accentColorDark: string | null;
  invertLogoDark: boolean;
  archivedAt: number | null;
}

interface PlatformStaffLocals {
  userId: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  status: 'active' | 'disabled';
  permissions: string[];
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    employee: PortalEmployee | null;
    organization: PortalOrganization | null;
    isCoordityApex: boolean;
    platformStaff: PlatformStaffLocals | null;
  }
}

interface Window {
  showSaveFlash?: (el: HTMLElement) => void;
}

interface Env {
  DB: D1Database;
  SESSION: KVNamespace;
  RESEND_API_KEY?: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  PORTAL_BOOTSTRAP_TOKEN: string;
  PORTAL_OWNER_EMAIL: string;
  COORDITY_PLATFORM_OWNER_EMAIL?: string;
  COORDITY_PLATFORM_BOOTSTRAP_TOKEN?: string;
  /** From address for all Coordity-sent email (Resend-verified). Defaults to admin@coordity.com. */
  COORDITY_FROM_EMAIL?: string;
  /** Alias kept for older configs; prefer COORDITY_FROM_EMAIL. */
  PORTAL_FROM_EMAIL?: string;
  PORTAL_ENVIRONMENT: string;
  QB_CLIENT_ID?: string;
  QB_CLIENT_SECRET?: string;
  QB_ENVIRONMENT?: string;
  PRACTICE_OPERATIONS_START?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
