import { env } from 'cloudflare:workers';

export function getEnv(): Env {
  const fromModule = env as unknown as Env;
  if (fromModule?.DB) return fromModule;
  throw new Error('Portal environment bindings are not available.');
}

export function isPreview(): boolean {
  try {
    return getEnv().PORTAL_ENVIRONMENT === 'preview';
  } catch {
    return false;
  }
}

export function qbApiEnvironment(): 'sandbox' | 'production' {
  const raw = (getEnv().QB_ENVIRONMENT ?? '').trim().toLowerCase();
  return raw === 'production' || raw === 'prod' ? 'production' : 'sandbox';
}

export function practiceOperationsStart(): string {
  const raw = (getEnv().PRACTICE_OPERATIONS_START ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '2026-06-01';
}
