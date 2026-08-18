import { betterAuth } from 'better-auth';
import { getEnv } from './env';

export function createAuth(request?: Request) {
  const env = getEnv();
  const origin = request ? new URL(request.url).origin : env.BETTER_AUTH_URL;

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || origin,
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
    trustedOrigins: [origin, env.BETTER_AUTH_URL].filter(Boolean),
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
      cookieCache: {
        enabled: false,
      },
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        secure: !origin.startsWith('http://localhost'),
        sameSite: 'lax',
        path: '/',
      },
    },
    user: {
      additionalFields: {},
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
