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
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Email is not configured for this portal yet.');
  }

  const fromEmail = (env.PORTAL_FROM_EMAIL ?? 'portal@wovensage.com').trim();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Coordity <${fromEmail}>`,
      to: [TIME_OFF_RECIPIENT],
      reply_to: payload.replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });

  const body = (await response.json()) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!response.ok) {
    throw new Error(body.message ?? 'Unable to send email.');
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
