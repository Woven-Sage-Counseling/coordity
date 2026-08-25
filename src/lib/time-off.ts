const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type TimeOffEntry = {
  date: string;
  fullDay: boolean;
  startTime: string | null;
  endTime: string | null;
};

export function parseTimeOffEntries(form: FormData): TimeOffEntry[] {
  const indices = new Set<number>();
  for (const key of form.keys()) {
    const match = key.match(/^entry_date_(\d+)$/);
    if (match) indices.add(Number(match[1]));
  }

  if (indices.size === 0) {
    throw new Error('Add at least one date.');
  }

  const entries: TimeOffEntry[] = [];
  for (const index of [...indices].sort((a, b) => a - b)) {
    const date = String(form.get(`entry_date_${index}`) ?? '').trim();
    if (!ISO_DATE.test(date)) {
      throw new Error('Each request needs a valid date.');
    }

    const fullDay = form.get(`entry_full_day_${index}`) === 'on';
    const startTime = String(form.get(`entry_start_${index}`) ?? '').trim();
    const endTime = String(form.get(`entry_end_${index}`) ?? '').trim();

    if (fullDay) {
      entries.push({ date, fullDay: true, startTime: null, endTime: null });
      continue;
    }

    if (!TIME.test(startTime) || !TIME.test(endTime)) {
      throw new Error('Partial-day requests need a start and end time, or mark the day as full day.');
    }
    if (startTime >= endTime) {
      throw new Error('End time must be after start time for partial-day requests.');
    }

    entries.push({ date, fullDay: false, startTime, endTime });
  }

  return entries;
}

export function formatTimeOffEntry(entry: TimeOffEntry): string {
  const dateLabel = new Date(`${entry.date}T12:00:00`).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  if (entry.fullDay) {
    return `${dateLabel} (full day)`;
  }

  return `${dateLabel} (${formatTime12(entry.startTime!)} – ${formatTime12(entry.endTime!)})`;
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
  const lines = input.entries.map((entry) => `- ${formatTimeOffEntry(entry)}`);
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

  const htmlLines = input.entries
    .map((entry) => `<li>${escapeHtml(formatTimeOffEntry(entry))}</li>`)
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
  const lines = input.entries.map((entry) => `- ${formatTimeOffEntry(entry)}`);
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

  const htmlLines = input.entries
    .map((entry) => `<li>${escapeHtml(formatTimeOffEntry(entry))}</li>`)
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
