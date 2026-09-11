import { getEnv } from './env';

const TIME_OFF_RECIPIENT = 'admin@wovensage.com';
/** Single Resend-verified From for all Coordity product email (client + tenant ops). */
const DEFAULT_COORDITY_FROM = 'admin@coordity.com';

export type AdminEmailPayload = {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Overrides the default recipient when set. */
  to?: string | string[];
  /** Overrides From. Defaults to admin@coordity.com. */
  from?: string;
};

/** From address for all Coordity-sent email (must be Resend-verified). */
export function getCoordityFromEmail(): string {
  const env = getEnv();
  return (env.COORDITY_FROM_EMAIL ?? env.PORTAL_FROM_EMAIL ?? DEFAULT_COORDITY_FROM).trim();
}

/** @deprecated Use getCoordityFromEmail — tenant ops also send from Coordity. */
export function getPortalFromEmail(): string {
  return getCoordityFromEmail();
}

async function sendAdminEmail(payload: AdminEmailPayload): Promise<void> {
  const env = getEnv();
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set on the portal. Add it in Cloudflare Pages secrets / GitHub Actions.',
    );
  }

  const fromEmail = (payload.from ?? getCoordityFromEmail()).trim();
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
    const detail = body.message ?? body.name ?? `HTTP ${response.status}`;
    throw new Error(`Resend rejected send from ${fromEmail}: ${detail}`);
  }
}

export async function notifyAdminEmail(
  payload: AdminEmailPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sendAdminEmail(payload);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send email.';
    console.error('admin email failed', error);
    return { ok: false, error: message };
  }
}

export async function sendTimeOffRequestEmail(payload: AdminEmailPayload): Promise<void> {
  await sendAdminEmail(payload);
}
