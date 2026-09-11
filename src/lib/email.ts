import { getEnv } from './env';

const TIME_OFF_RECIPIENT = 'admin@wovensage.com';
const DEFAULT_WOVEN_FROM = 'portal@wovensage.com';
const DEFAULT_COORDITY_FROM = 'hello@coordity.com';

export type AdminEmailPayload = {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Overrides the default Woven Sage admin recipient when set. */
  to?: string | string[];
  /**
   * Overrides the From address. Use for Coordity-facing mail so it never
   * appears to come from wovensage.com.
   */
  from?: string;
};

/** From address for Coordity product / client-facing email. */
export function getCoordityFromEmail(): string {
  const env = getEnv();
  return (env.COORDITY_FROM_EMAIL ?? DEFAULT_COORDITY_FROM).trim();
}

/** From address for tenant portal ops email (defaults to Woven Sage). */
export function getPortalFromEmail(): string {
  const env = getEnv();
  return (env.PORTAL_FROM_EMAIL ?? DEFAULT_WOVEN_FROM).trim();
}

async function sendAdminEmail(payload: AdminEmailPayload): Promise<void> {
  const env = getEnv();
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Email is not configured for this portal yet.');
  }

  const fromEmail = (payload.from ?? getPortalFromEmail()).trim();
  const to = payload.to
    ? Array.isArray(payload.to)
      ? payload.to
      : [payload.to]
    : [TIME_OFF_RECIPIENT];
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Coordity <${fromEmail}>`,
      to,
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
