import { betterAuth } from 'better-auth';
import { getEnv } from './env';

export function createAuth(request?: Request) {
  const env = getEnv();
  const origin = request ? new URL(request.url).origin : env.BETTER_AUTH_URL;
  // Prefer request origin so each {org}.coordity.com keeps host-only cookies.
  const baseURL = origin || env.BETTER_AUTH_URL;

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
    trustedOrigins: [
      origin,
      env.BETTER_AUTH_URL,
      'https://coordity.com',
      'https://www.coordity.com',
      'https://wovensage.coordity.com',
      'https://portal.wovensage.com',
      'https://wovensage-portal-preview.pages.dev',
    ].filter(Boolean),
    user: {
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
      cookieCache: {
        enabled: false,
      },
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        userId: 'user_id',
      },
    },
    account: {
      fields: {
        accountId: 'account_id',
        providerId: 'provider_id',
        userId: 'user_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        secure: !baseURL.startsWith('http://localhost'),
        sameSite: 'lax',
        path: '/',
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
