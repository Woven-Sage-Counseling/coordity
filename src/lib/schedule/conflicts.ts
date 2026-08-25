import { formatScheduleEventDay, formatScheduleEventTime, groupEventsByDay } from './range';
import type { ScheduleEvent } from './types';

export interface ScheduleConflict {
  dayKey: string;
  eventA: ScheduleEvent;
  eventB: ScheduleEvent;
  sourceId: string;
}

export function findTimedConflicts(
  events: ScheduleEvent[],
  options: { includePast?: boolean } = {},
): ScheduleConflict[] {
  const timed = events.filter((event) => !event.allDay);
  const byDay = groupEventsByDay(timed);
  const conflicts: ScheduleConflict[] = [];
  const seen = new Set<string>();
  const includePast = options.includePast === true;

  for (const [dayKey, dayEvents] of byDay) {
    for (let index = 0; index < dayEvents.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < dayEvents.length; otherIndex += 1) {
        const eventA = dayEvents[index]!;
        const eventB = dayEvents[otherIndex]!;
        const startA = Date.parse(eventA.start);
        const endA = Date.parse(eventA.end);
        const startB = Date.parse(eventB.start);
        const endB = Date.parse(eventB.end);
        if (Number.isNaN(startA) || Number.isNaN(endA) || Number.isNaN(startB) || Number.isNaN(endB)) {
          continue;
        }
        if (startA >= endB || startB >= endA) continue;

        const overlapEnd = Math.min(endA, endB);
        if (!includePast && overlapEnd <= Date.now()) continue;

        const sourceId = `${dayKey}:${[eventA.id, eventB.id].sort().join('|')}`;
        if (seen.has(sourceId)) continue;
        seen.add(sourceId);
        conflicts.push({ dayKey, eventA, eventB, sourceId });
      }
    }
  }

  return conflicts;
}

export function conflictingEventCount(events: ScheduleEvent[]): number {
  const ids = new Set<string>();
  for (const conflict of findTimedConflicts(events, { includePast: true })) {
    ids.add(conflict.eventA.id);
    ids.add(conflict.eventB.id);
  }
  return ids.size;
}

export function conflictCountLabel(count: number): string {
  return count === 1 ? '1 conflicting event' : `${count} conflicting events`;
}

export function formatConflictNotification(conflict: ScheduleConflict): { title: string; body: string } {
  const dayLabel = formatScheduleEventDay(conflict.dayKey);
  const timeA = formatScheduleEventTime(conflict.eventA);
  const timeB = formatScheduleEventTime(conflict.eventB);
  return {
    title: `Schedule conflict on ${dayLabel}`,
    body: `${conflict.eventA.title} (${timeA}) overlaps with ${conflict.eventB.title} (${timeB})`,
  };
}
