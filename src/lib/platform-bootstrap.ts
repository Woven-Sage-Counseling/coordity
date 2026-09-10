import type { Auth } from './auth';
import { getEnv } from './env';
import { nowMs } from './crypto';
import { upsertPlatformStaff } from './platform-access';

/** Create or promote a platform-only owner account (no tenant org membership). */
export async function createPlatformOwnerAccount(
  auth: Auth,
  input: { email: string; name: string; password: string },
) {
  const { DB } = getEnv();
  const email = input.email.toLowerCase().trim();

  const existing = await DB.prepare(`SELECT id FROM user WHERE lower(email) = ?`)
    .bind(email)
    .first<{ id: string }>();

  if (existing) {
    await upsertPlatformStaff({ userId: existing.id, roleId: 'plat_role_owner' });
    return { id: existing.id, email, created: false as const };
  }

  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      email,
      name: input.name.trim(),
      emailVerified: true,
    },
    { method: 'email-password' },
  );
  if (!user) throw new Error('Unable to create the platform account.');

  const hashed = await ctx.password.hash(input.password);
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    accountId: user.id,
    providerId: 'credential',
    issuer: 'local:credential',
    password: hashed,
  });

  const ts = nowMs();
  await DB.prepare(
    `INSERT INTO employee_profile (user_id, status, created_at, updated_at) VALUES (?, 'active', ?, ?)`,
  )
    .bind(user.id, ts, ts)
    .run();

  await upsertPlatformStaff({ userId: user.id, roleId: 'plat_role_owner' });
  return { id: user.id, email, created: true as const };
}
