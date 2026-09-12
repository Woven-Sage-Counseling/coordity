import type { APIRoute } from 'astro';
import { timingSafeEqual } from '../../../lib/crypto';
import { updateEnvelopeStatusByEnvelopeId } from '../../../lib/docusign';
import { getEnv } from '../../../lib/env';

export const prerender = false;

/**
 * DocuSign Connect webhook.
 * Configure Connect to POST JSON to /api/docusign/webhook and set DOCUSIGN_CONNECT_HMAC_KEY
 * to the Connect HMAC secret when available.
 */
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = await request.text();
  const hmacKey = env.DOCUSIGN_CONNECT_HMAC_KEY;
  if (hmacKey) {
    const header =
      request.headers.get('X-DocuSign-Signature-1') ||
      request.headers.get('x-docusign-signature-1') ||
      '';
    const digest = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(hmacKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', digest, new TextEncoder().encode(body));
    const computed = btoa(String.fromCharCode(...new Uint8Array(signature)));
    if (!header || !timingSafeEqual(header, computed)) {
      return new Response('Invalid signature', { status: 401 });
    }
  }

  try {
    const payload = JSON.parse(body) as {
      envelopeId?: string;
      status?: string;
      data?: { envelopeId?: string; envelopeSummary?: { status?: string } };
    };
    const envelopeId = payload.envelopeId || payload.data?.envelopeId;
    const status =
      payload.status || payload.data?.envelopeSummary?.status || '';
    if (envelopeId && status) {
      await updateEnvelopeStatusByEnvelopeId(envelopeId, status);
    }
  } catch {
    return new Response('Bad payload', { status: 400 });
  }

  return new Response('ok', { status: 200 });
};
