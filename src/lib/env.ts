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
