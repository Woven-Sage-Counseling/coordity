import { getEnv } from './env';
import { randomToken, nowMs } from './crypto';

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      randomToken(16),
      input.actorUserId ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      nowMs(),
    )
    .run();
}
