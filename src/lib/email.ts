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
  const fromEmail = (env.PORTAL_FROM_EMAIL ?? 'portal@wovensage.com').trim();
  const { subject, text, html } = buildTimeOffEmail(input);

  if (env.EMAIL) {
    await env.EMAIL.send({
      to: TIME_OFF_RECIPIENT,
      from: { email: fromEmail, name: 'Woven Sage Portal' },
      replyTo: input.employeeEmail,
      subject,
      text,
      html,
    });
    return;
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error('Email is not configured for this portal yet.');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: TIME_OFF_RECIPIENT,
        from: { address: fromEmail, name: 'Woven Sage Portal' },
        reply_to: input.employeeEmail,
        subject,
        text,
        html,
      }),
    },
  );

  const payload = (await response.json()) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || !payload.success) {
    const message = payload.errors?.[0]?.message ?? 'Unable to send email.';
    throw new Error(message);
  }
}
