import {
  deleteNotificationsBySourceExcept,
  listNotificationSourceIds,
  notifyUser,
} from '../notifications';
import { findTimedConflicts, formatConflictNotification } from './conflicts';
import type { ScheduleEvent } from './types';

const SOURCE_TYPE = 'calendar_conflict';

export async function syncScheduleConflictNotifications(
  userId: string,
  events: ScheduleEvent[],
): Promise<void> {
  const conflicts = findTimedConflicts(events);
  const activeSourceIds = conflicts.map((conflict) => conflict.sourceId);

  await deleteNotificationsBySourceExcept(userId, SOURCE_TYPE, activeSourceIds);

  if (conflicts.length === 0) return;

  const existing = await listNotificationSourceIds(userId, SOURCE_TYPE);
  for (const conflict of conflicts) {
    if (existing.has(conflict.sourceId)) continue;
    const { title, body } = formatConflictNotification(conflict);
    await notifyUser({
      userId,
      title,
      body,
      sourceType: SOURCE_TYPE,
      sourceId: conflict.sourceId,
    });
  }
}
