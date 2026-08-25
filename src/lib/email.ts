import { getEnv } from './env';

const TIME_OFF_RECIPIENT = 'admin@wovensage.com';

export type AdminEmailPayload = {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

async function sendAdminEmail(payload: AdminEmailPayload): Promise<void> {
  const env = getEnv();
  const fromEmail = (env.PORTAL_FROM_EMAIL ?? 'portal@wovensage.com').trim();

  if (env.EMAIL) {
    await env.EMAIL.send({
      to: TIME_OFF_RECIPIENT,
      from: { email: fromEmail, name: 'Woven Sage Portal' },
      replyTo: payload.replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
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
        reply_to: payload.replyTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      }),
    },
  );

  const body = (await response.json()) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || !body.success) {
    const message = body.errors?.[0]?.message ?? 'Unable to send email.';
    throw new Error(message);
  }
}

export async function notifyAdminEmail(payload: AdminEmailPayload): Promise<boolean> {
  try {
    await sendAdminEmail(payload);
    return true;
  } catch (error) {
    console.error('admin email failed', error);
    return false;
  }
}

export async function sendTimeOffRequestEmail(payload: AdminEmailPayload): Promise<void> {
  await sendAdminEmail(payload);
}
