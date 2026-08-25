export const SCHEDULE_RANGE_IDS = ['today', 'this_week', 'next_7_days', 'next_14_days'] as const;

export type ScheduleRangeId = (typeof SCHEDULE_RANGE_IDS)[number];

export interface ResolvedScheduleRange {
  id: ScheduleRangeId;
  start: string;
  end: string;
  label: string;
  timeMin: string;
  timeMax: string;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  calendarName: string;
  calendarColor: string | null;
  htmlLink: string | null;
}

export interface ScheduleCalendarOption {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface ScheduleConnection {
  status: 'disconnected' | 'connected' | 'error';
  googleEmail: string | null;
  lastError: string | null;
  configured: boolean;
}

export interface ScheduleSummary {
  connection: ScheduleConnection;
  range: ResolvedScheduleRange;
  events: ScheduleEvent[];
  calendars: ScheduleCalendarOption[];
}
