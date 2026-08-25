import { getEnv } from './env';
import { buildTimeOffEmail, type TimeOffEntry } from './time-off';

const TIME_OFF_RECIPIENT = 'admin@wovensage.com';

export async function sendTimeOffRequestEmail(input: {
  employeeName: string;
  employeeEmail: string;
  entries: TimeOffEntry[];
  notes: string;
}): Promise<void> {
  const env = getEnv();
  if (!env.EMAIL) {
    throw new Error('Email is not configured for this portal yet.');
  }

  const fromEmail = (env.PORTAL_FROM_EMAIL ?? 'portal@wovensage.com').trim();
  const { subject, text, html } = buildTimeOffEmail(input);

  await env.EMAIL.send({
    to: TIME_OFF_RECIPIENT,
    from: { email: fromEmail, name: 'Woven Sage Portal' },
    replyTo: input.employeeEmail,
    subject,
    text,
    html,
  });
}
