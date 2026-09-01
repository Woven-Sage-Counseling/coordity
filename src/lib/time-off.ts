import { addDays } from './timesheet';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_TIME_OFF_RANGE_DAYS = 120;

export type TimeOffEntry = {
  date: string;
  fullDay: boolean;
  startTime: string | null;
  endTime: string | null;
};

function parseRowIndices(form: FormData): number[] {
  const indices = new Set<number>();
  for (const key of form.keys()) {
    const startMatch = key.match(/^entry_start_date_(\d+)$/);
    const legacyMatch = key.match(/^entry_date_(\d+)$/);
    if (startMatch) indices.add(Number(startMatch[1]));
    else if (legacyMatch) indices.add(Number(legacyMatch[1]));
  }
  return [...indices].sort((a, b) => a - b);
}

function expandDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    if (dates.length > MAX_TIME_OFF_RANGE_DAYS) {
      throw new Error(`Each period can cover at most ${MAX_TIME_OFF_RANGE_DAYS} days.`);
    }
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function parseTimeOffEntries(form: FormData): TimeOffEntry[] {
  const indices = parseRowIndices(form);
  if (indices.length === 0) {
    throw new Error('Add at least one date.');
  }

  const entries: TimeOffEntry[] = [];
  const seenDates = new Set<string>();

  for (const index of indices) {
    const startDate = String(
      form.get(`entry_start_date_${index}`) ?? form.get(`entry_date_${index}`) ?? '',
    ).trim();
    const endDate = String(form.get(`entry_end_date_${index}`) ?? startDate).trim();

    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
      throw new Error('Each request needs valid start and end dates.');
    }
    if (endDate < startDate) {
      throw new Error('End date must be on or after the start date.');
    }

    const dates = expandDateRange(startDate, endDate);
    const fullDay = form.get(`entry_full_day_${index}`) === 'on';
    const startTime =
      fullDay || dates.length > 1
        ? ''
        : String(form.get(`entry_start_${index}`) ?? '').trim();
    const endTime =
      fullDay || dates.length > 1
        ? ''
        : String(form.get(`entry_end_${index}`) ?? '').trim();

    if (dates.length === 1) {
      if (fullDay) {
        addUniqueEntry(entries, seenDates, {
          date: dates[0]!,
          fullDay: true,
          startTime: null,
          endTime: null,
        });
        continue;
      }

      if (!TIME.test(startTime) || !TIME.test(endTime)) {
        throw new Error('Partial-day requests need a start and end time, or mark the day as full day.');
      }
      if (startTime >= endTime) {
        throw new Error('End time must be after start time for partial-day requests.');
      }

      addUniqueEntry(entries, seenDates, {
        date: dates[0]!,
        fullDay: false,
        startTime,
        endTime,
      });
      continue;
    }

    if (!fullDay) {
      throw new Error('Multi-day requests must be full days.');
    }

    for (const date of dates) {
      addUniqueEntry(entries, seenDates, {
        date,
        fullDay: true,
        startTime: null,
        endTime: null,
      });
    }
  }

  if (entries.length === 0) {
    throw new Error('Add at least one date.');
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

function addUniqueEntry(
  entries: TimeOffEntry[],
  seenDates: Set<string>,
  entry: TimeOffEntry,
): void {
  if (seenDates.has(entry.date)) {
    throw new Error('Each date can only appear once in a request.');
  }
  seenDates.add(entry.date);
  entries.push(entry);
}

function formatTimeOffDate(
  date: string,
  options: { weekday?: boolean } = {},
): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: options.weekday ? 'long' : undefined,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeOffEntry(entry: TimeOffEntry): string {
  const dateLabel = formatTimeOffDate(entry.date, { weekday: true });

  if (entry.fullDay) {
    return `${dateLabel} (full day)`;
  }

  return `${dateLabel} (${formatTime12(entry.startTime!)} – ${formatTime12(entry.endTime!)})`;
}

function formatTimeOffDateRange(startDate: string, endDate: string): string {
  const startLabel = formatTimeOffDate(startDate, { weekday: true });
  const endLabel = formatTimeOffDate(endDate, { weekday: true });
  return `${startLabel} – ${endLabel} (full days)`;
}

function isNextCalendarDay(left: string, right: string): boolean {
  return addDays(left, 1) === right;
}

export function formatTimeOffRequestEntries(entries: TimeOffEntry[]): string[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const labels: string[] = [];
  let index = 0;

  while (index < sorted.length) {
    const entry = sorted[index]!;
    if (!entry.fullDay) {
      labels.push(formatTimeOffEntry(entry));
      index += 1;
      continue;
    }

    let endIndex = index;
    while (
      endIndex + 1 < sorted.length &&
      sorted[endIndex + 1]!.fullDay &&
      isNextCalendarDay(sorted[endIndex]!.date, sorted[endIndex + 1]!.date)
    ) {
      endIndex += 1;
    }

    if (endIndex === index) {
      labels.push(formatTimeOffEntry(entry));
    } else {
      labels.push(formatTimeOffDateRange(entry.date, sorted[endIndex]!.date));
    }
    index = endIndex + 1;
  }

  return labels;
}

function formatTime12(value: string): string {
  const [hourPart, minutePart] = value.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${displayHour} ${suffix}` : `${displayHour}:${minutePart} ${suffix}`;
}

export function buildTimeOffEmail(input: {
  employeeName: string;
  employeeEmail: string;
  entries: TimeOffEntry[];
  notes: string;
}): { subject: string; text: string; html: string; replyTo: string } {
  const lines = formatTimeOffRequestEntries(input.entries).map((entry) => `- ${entry}`);
  const notes = input.notes.trim();
  const subject = `Time off request from ${input.employeeName}`;

  const textParts = [
    `${input.employeeName} (${input.employeeEmail}) requested time off:`,
    '',
    ...lines,
  ];
  if (notes) {
    textParts.push('', `Notes: ${notes}`);
  }
  textParts.push('', 'Submitted via the Woven Sage employee portal.');

  const htmlLines = formatTimeOffRequestEntries(input.entries)
    .map((entry) => `<li>${escapeHtml(entry)}</li>`)
    .join('');

  const html = `
    <p><strong>${escapeHtml(input.employeeName)}</strong> (${escapeHtml(input.employeeEmail)}) requested time off:</p>
    <ul>${htmlLines}</ul>
    ${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}
    <p style="color:#6b6c72;font-size:13px;">Submitted via the Woven Sage employee portal.</p>
  `.trim();

  return {
    subject,
    text: textParts.join('\n'),
    html,
    replyTo: input.employeeEmail,
  };
}

export function buildTimeOffRetractionEmail(input: {
  employeeName: string;
  employeeEmail: string;
  entries: TimeOffEntry[];
  notes: string;
}): { subject: string; text: string; html: string; replyTo: string } {
  const lines = formatTimeOffRequestEntries(input.entries).map((entry) => `- ${entry}`);
  const notes = input.notes.trim();
  const subject = `Time off request retracted by ${input.employeeName}`;

  const textParts = [
    `${input.employeeName} (${input.employeeEmail}) retracted a pending time off request:`,
    '',
    ...lines,
  ];
  if (notes) {
    textParts.push('', `Original notes: ${notes}`);
  }
  textParts.push('', 'The request was removed from the employee portal.');

  const htmlLines = formatTimeOffRequestEntries(input.entries)
    .map((entry) => `<li>${escapeHtml(entry)}</li>`)
    .join('');

  const html = `
    <p><strong>${escapeHtml(input.employeeName)}</strong> (${escapeHtml(input.employeeEmail)}) retracted a pending time off request:</p>
    <ul>${htmlLines}</ul>
    ${notes ? `<p><strong>Original notes:</strong> ${escapeHtml(notes)}</p>` : ''}
    <p style="color:#6b6c72;font-size:13px;">The request was removed from the employee portal.</p>
  `.trim();

  return {
    subject,
    text: textParts.join('\n'),
    html,
    replyTo: input.employeeEmail,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
