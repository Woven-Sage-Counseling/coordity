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
  | 'employees:manage';

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

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    employee: PortalEmployee | null;
  }
}

interface Env {
  DB: D1Database;
  SESSION: KVNamespace;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  PORTAL_BOOTSTRAP_TOKEN: string;
  PORTAL_OWNER_EMAIL: string;
  PORTAL_ENVIRONMENT: string;
  QB_CLIENT_ID?: string;
  QB_CLIENT_SECRET?: string;
  QB_ENVIRONMENT?: string;
  PRACTICE_OPERATIONS_START?: string;
}
