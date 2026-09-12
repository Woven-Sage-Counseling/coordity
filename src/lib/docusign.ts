import { getEnv } from './env';
import { nowMs, randomToken } from './crypto';

const OAUTH_STATE_PREFIX = 'docusign-oauth:';

export interface DocuSignConnectionStatus {
  configured: boolean;
  status: 'disconnected' | 'connected' | 'error';
  accountEmail: string | null;
  accountName: string | null;
  accountId: string | null;
  lastError: string | null;
  connectedAt: number | null;
}

export interface DocuSignTemplate {
  templateId: string;
  name: string;
  description: string;
}

type ConnectionRow = {
  org_id: string;
  account_id: string | null;
  base_uri: string | null;
  account_email: string | null;
  account_name: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: number | null;
  status: string;
  last_error: string | null;
  connected_at: number | null;
};

function authServer(): string {
  const env = getEnv();
  return (env.DOCUSIGN_AUTH_SERVER || 'https://account-d.docusign.com').replace(/\/$/, '');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(getEnv().BETTER_AUTH_SECRET);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const packed = new Uint8Array(iv.byteLength + encrypted.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(encrypted), iv.byteLength);
  return bytesToBase64(packed);
}

async function decryptSecret(payload: string): Promise<string> {
  const packed = base64ToBytes(payload);
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const key = await aesKey(getEnv().BETTER_AUTH_SECRET);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

function basicAuth(clientId: string, clientSecret: string): string {
  return btoa(`${clientId}:${clientSecret}`);
}

export function isDocuSignConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.DOCUSIGN_INTEGRATION_KEY && env.DOCUSIGN_SECRET_KEY);
}

export function docusignAuthorizationUrl(state: string, redirectUri: string): string {
  const env = getEnv();
  const params = new URLSearchParams({
    response_type: 'code',
    scope: 'signature extended',
    client_id: env.DOCUSIGN_INTEGRATION_KEY ?? '',
    redirect_uri: redirectUri,
    state,
  });
  return `${authServer()}/oauth/auth?${params.toString()}`;
}

export async function saveDocuSignOauthState(
  state: string,
  payload: { userId: string; orgId: string; returnTo?: string },
): Promise<void> {
  const { SESSION } = getEnv();
  if (!SESSION) throw new Error('SESSION binding is required for DocuSign OAuth.');
  await SESSION.put(`${OAUTH_STATE_PREFIX}${state}`, JSON.stringify({ ...payload, createdAt: nowMs() }), {
    expirationTtl: 600,
  });
}

export async function readDocuSignOauthState(
  state: string,
): Promise<{ userId: string; orgId: string; returnTo?: string } | null> {
  const { SESSION } = getEnv();
  const raw = await SESSION?.get(`${OAUTH_STATE_PREFIX}${state}`);
  if (!raw) return null;
  await SESSION?.delete(`${OAUTH_STATE_PREFIX}${state}`);
  try {
    const parsed = JSON.parse(raw) as { userId?: string; orgId?: string; returnTo?: string };
    if (!parsed.userId || !parsed.orgId) return null;
    return { userId: parsed.userId, orgId: parsed.orgId, returnTo: parsed.returnTo };
  } catch {
    return null;
  }
}

async function requestTokens(body: URLSearchParams): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const env = getEnv();
  if (!env.DOCUSIGN_INTEGRATION_KEY || !env.DOCUSIGN_SECRET_KEY) {
    throw new Error('DocuSign credentials are not configured.');
  }
  const response = await fetch(`${authServer()}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(env.DOCUSIGN_INTEGRATION_KEY, env.DOCUSIGN_SECRET_KEY)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DocuSign token exchange failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

async function fetchUserInfo(accessToken: string): Promise<{
  email: string;
  name: string;
  accountId: string;
  baseUri: string;
}> {
  const response = await fetch(`${authServer()}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Could not load DocuSign account info.');
  }
  const data = (await response.json()) as {
    email?: string;
    name?: string;
    accounts?: Array<{
      account_id?: string;
      is_default?: boolean;
      base_uri?: string;
      account_name?: string;
    }>;
  };
  const account =
    data.accounts?.find((item) => item.is_default) ?? data.accounts?.[0] ?? null;
  if (!account?.account_id || !account.base_uri) {
    throw new Error('DocuSign account is missing an API base URI.');
  }
  return {
    email: data.email ?? '',
    name: account.account_name || data.name || data.email || 'DocuSign',
    accountId: account.account_id,
    baseUri: account.base_uri.replace(/\/$/, ''),
  };
}

export async function exchangeDocuSignCode(input: {
  orgId: string;
  userId: string;
  code: string;
  redirectUri: string;
}): Promise<void> {
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  );
  const info = await fetchUserInfo(tokens.access_token);
  const { DB } = getEnv();
  const ts = nowMs();
  await DB.prepare(
    `INSERT INTO docusign_connection
       (org_id, account_id, base_uri, account_email, account_name,
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        status, connected_by, connected_at, last_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?, NULL, ?)
     ON CONFLICT(org_id) DO UPDATE SET
       account_id = excluded.account_id,
       base_uri = excluded.base_uri,
       account_email = excluded.account_email,
       account_name = excluded.account_name,
       access_token_encrypted = excluded.access_token_encrypted,
       refresh_token_encrypted = excluded.refresh_token_encrypted,
       token_expires_at = excluded.token_expires_at,
       status = 'connected',
       connected_by = excluded.connected_by,
       connected_at = excluded.connected_at,
       last_error = NULL,
       updated_at = excluded.updated_at`,
  )
    .bind(
      input.orgId,
      info.accountId,
      info.baseUri,
      info.email,
      info.name,
      await encryptSecret(tokens.access_token),
      await encryptSecret(tokens.refresh_token),
      ts + Math.max(60, tokens.expires_in - 60) * 1000,
      input.userId,
      ts,
      ts,
    )
    .run();
}

async function connectionRow(orgId: string): Promise<ConnectionRow | null> {
  const { DB } = getEnv();
  return (
    (await DB.prepare(
      `SELECT org_id, account_id, base_uri, account_email, account_name,
              access_token_encrypted, refresh_token_encrypted, token_expires_at,
              status, last_error, connected_at
       FROM docusign_connection WHERE org_id = ?`,
    )
      .bind(orgId)
      .first<ConnectionRow>()) ?? null
  );
}

export async function getDocuSignConnectionStatus(orgId: string): Promise<DocuSignConnectionStatus> {
  const configured = isDocuSignConfigured();
  const row = await connectionRow(orgId);
  if (!row) {
    return {
      configured,
      status: 'disconnected',
      accountEmail: null,
      accountName: null,
      accountId: null,
      lastError: null,
      connectedAt: null,
    };
  }
  const status =
    row.status === 'connected' || row.status === 'error' || row.status === 'disconnected'
      ? row.status
      : 'disconnected';
  return {
    configured,
    status,
    accountEmail: row.account_email,
    accountName: row.account_name,
    accountId: row.account_id,
    lastError: row.last_error,
    connectedAt: row.connected_at,
  };
}

export async function disconnectDocuSign(orgId: string): Promise<void> {
  const { DB } = getEnv();
  const ts = nowMs();
  await DB.prepare(
    `UPDATE docusign_connection
     SET access_token_encrypted = NULL,
         refresh_token_encrypted = NULL,
         token_expires_at = NULL,
         status = 'disconnected',
         last_error = NULL,
         updated_at = ?
     WHERE org_id = ?`,
  )
    .bind(ts, orgId)
    .run();
}

async function markConnectionError(orgId: string, message: string): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `UPDATE docusign_connection
     SET status = 'error', last_error = ?, updated_at = ?
     WHERE org_id = ?`,
  )
    .bind(message.slice(0, 500), nowMs(), orgId)
    .run();
}

async function validAccessToken(orgId: string): Promise<{
  accessToken: string;
  accountId: string;
  baseUri: string;
}> {
  const row = await connectionRow(orgId);
  if (
    !row ||
    row.status !== 'connected' ||
    !row.account_id ||
    !row.base_uri ||
    !row.access_token_encrypted ||
    !row.refresh_token_encrypted
  ) {
    throw new Error('DocuSign is not connected. Connect it under Admin → Integrations.');
  }

  const stillFresh = row.token_expires_at != null && row.token_expires_at > nowMs() + 30_000;
  if (stillFresh) {
    return {
      accessToken: await decryptSecret(row.access_token_encrypted),
      accountId: row.account_id,
      baseUri: row.base_uri,
    };
  }

  try {
    const refreshToken = await decryptSecret(row.refresh_token_encrypted);
    const tokens = await requestTokens(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );
    const { DB } = getEnv();
    const ts = nowMs();
    await DB.prepare(
      `UPDATE docusign_connection
       SET access_token_encrypted = ?,
           refresh_token_encrypted = ?,
           token_expires_at = ?,
           status = 'connected',
           last_error = NULL,
           updated_at = ?
       WHERE org_id = ?`,
    )
      .bind(
        await encryptSecret(tokens.access_token),
        await encryptSecret(tokens.refresh_token || refreshToken),
        ts + Math.max(60, tokens.expires_in - 60) * 1000,
        ts,
        orgId,
      )
      .run();
    return {
      accessToken: tokens.access_token,
      accountId: row.account_id,
      baseUri: row.base_uri,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DocuSign re-auth failed.';
    await markConnectionError(orgId, message);
    throw new Error('DocuSign session expired. Reconnect under Admin → Integrations.');
  }
}

async function docusignFetch(
  orgId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { accessToken, accountId, baseUri } = await validAccessToken(orgId);
  const url = `${baseUri}/restapi/v2.1/accounts/${accountId}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export async function listDocuSignTemplates(orgId: string): Promise<DocuSignTemplate[]> {
  const response = await docusignFetch(orgId, '/templates?count=100');
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not list DocuSign templates (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    envelopeTemplates?: Array<{ templateId?: string; name?: string; description?: string }>;
  };
  return (data.envelopeTemplates ?? [])
    .filter((item) => item.templateId && item.name)
    .map((item) => ({
      templateId: item.templateId!,
      name: item.name!,
      description: item.description ?? '',
    }));
}

export async function createEmbeddedSigningSession(input: {
  orgId: string;
  templateId: string;
  signerName: string;
  signerEmail: string;
  clientUserId: string;
  returnUrl: string;
  emailSubject?: string;
}): Promise<{ envelopeId: string; signingUrl: string }> {
  const roleNames = await listTemplateRoleNames(input.orgId, input.templateId);
  const candidates = [...roleNames, 'Signer', 'Employee', 'Signer 1'];
  let lastError = 'Could not create DocuSign envelope.';

  for (const roleName of candidates) {
    const createResponse = await docusignFetch(input.orgId, '/envelopes', {
      method: 'POST',
      body: JSON.stringify({
        templateId: input.templateId,
        status: 'sent',
        emailSubject: input.emailSubject || 'Please sign this document',
        templateRoles: [
          {
            roleName,
            name: input.signerName,
            email: input.signerEmail,
            clientUserId: input.clientUserId,
          },
        ],
      }),
    });
    if (!createResponse.ok) {
      lastError = await createResponse.text();
      continue;
    }
    const created = (await createResponse.json()) as { envelopeId?: string };
    if (!created.envelopeId) throw new Error('DocuSign did not return an envelope id.');
    const signingUrl = await createRecipientView({
      orgId: input.orgId,
      envelopeId: created.envelopeId,
      signerName: input.signerName,
      signerEmail: input.signerEmail,
      clientUserId: input.clientUserId,
      returnUrl: input.returnUrl,
    });
    return { envelopeId: created.envelopeId, signingUrl };
  }

  throw new Error(
    `Could not create DocuSign envelope. Ensure the template has a signer recipient role. ${lastError.slice(0, 200)}`,
  );
}

async function listTemplateRoleNames(orgId: string, templateId: string): Promise<string[]> {
  const response = await docusignFetch(orgId, `/templates/${templateId}?include=recipients`);
  if (!response.ok) return [];
  const data = (await response.json()) as {
    recipients?: {
      signers?: Array<{ roleName?: string }>;
    };
  };
  return (data.recipients?.signers ?? [])
    .map((signer) => signer.roleName?.trim())
    .filter((name): name is string => Boolean(name));
}

async function createRecipientView(input: {
  orgId: string;
  envelopeId: string;
  signerName: string;
  signerEmail: string;
  clientUserId: string;
  returnUrl: string;
}): Promise<string> {
  const response = await docusignFetch(input.orgId, `/envelopes/${input.envelopeId}/views/recipient`, {
    method: 'POST',
    body: JSON.stringify({
      authenticationMethod: 'none',
      clientUserId: input.clientUserId,
      email: input.signerEmail,
      userName: input.signerName,
      returnUrl: input.returnUrl,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not open DocuSign signing view (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error('DocuSign did not return a signing URL.');
  return data.url;
}

export async function getEnvelopeStatus(
  orgId: string,
  envelopeId: string,
): Promise<string> {
  const response = await docusignFetch(orgId, `/envelopes/${envelopeId}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not load envelope status (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = (await response.json()) as { status?: string };
  return (data.status ?? 'sent').toLowerCase();
}

export async function upsertTrainingEnvelope(input: {
  orgId: string;
  blockId: string;
  lessonId: string;
  userId: string;
  envelopeId: string;
  status: string;
}): Promise<string> {
  const { DB } = getEnv();
  const ts = nowMs();
  const existing = await DB.prepare(
    `SELECT id FROM training_docusign_envelope WHERE block_id = ? AND user_id = ?`,
  )
    .bind(input.blockId, input.userId)
    .first<{ id: string }>();
  const id = existing?.id ?? randomToken(16);
  const status = normalizeEnvelopeStatus(input.status);
  const completedAt = status === 'completed' ? ts : null;
  await DB.prepare(
    `INSERT INTO training_docusign_envelope
       (id, org_id, block_id, lesson_id, user_id, envelope_id, status, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(block_id, user_id) DO UPDATE SET
       envelope_id = excluded.envelope_id,
       status = excluded.status,
       completed_at = CASE
         WHEN excluded.status = 'completed' THEN COALESCE(training_docusign_envelope.completed_at, excluded.completed_at)
         ELSE training_docusign_envelope.completed_at
       END,
       updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      input.orgId,
      input.blockId,
      input.lessonId,
      input.userId,
      input.envelopeId,
      status,
      completedAt,
      ts,
      ts,
    )
    .run();
  return id;
}

function normalizeEnvelopeStatus(status: string): string {
  const value = status.toLowerCase();
  if (
    value === 'created' ||
    value === 'sent' ||
    value === 'delivered' ||
    value === 'completed' ||
    value === 'declined' ||
    value === 'voided'
  ) {
    return value;
  }
  return 'sent';
}

export async function updateEnvelopeStatusByEnvelopeId(
  envelopeId: string,
  status: string,
): Promise<void> {
  const { DB } = getEnv();
  const normalized = normalizeEnvelopeStatus(status);
  const ts = nowMs();
  await DB.prepare(
    `UPDATE training_docusign_envelope
     SET status = ?,
         completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE completed_at END,
         updated_at = ?
     WHERE envelope_id = ?`,
  )
    .bind(normalized, normalized, ts, ts, envelopeId)
    .run();
}

export async function latestDocuSignComplete(userId: string, blockId: string): Promise<boolean> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT status FROM training_docusign_envelope WHERE user_id = ? AND block_id = ?`,
  )
    .bind(userId, blockId)
    .first<{ status: string }>();
  return row?.status === 'completed';
}

export async function getDocuSignEnvelopeForUser(
  userId: string,
  blockId: string,
): Promise<{ envelopeId: string; status: string; completedAt: number | null } | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT envelope_id, status, completed_at
     FROM training_docusign_envelope WHERE user_id = ? AND block_id = ?`,
  )
    .bind(userId, blockId)
    .first<{ envelope_id: string; status: string; completed_at: number | null }>();
  if (!row) return null;
  return {
    envelopeId: row.envelope_id,
    status: row.status,
    completedAt: row.completed_at,
  };
}

export async function listDocuSignStatusesForLesson(
  lessonId: string,
): Promise<Array<{ userId: string; blockId: string; status: string; completedAt: number | null }>> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT user_id, block_id, status, completed_at
     FROM training_docusign_envelope WHERE lesson_id = ?`,
  )
    .bind(lessonId)
    .all<{ user_id: string; block_id: string; status: string; completed_at: number | null }>();
  return (rows.results ?? []).map((row) => ({
    userId: row.user_id,
    blockId: row.block_id,
    status: row.status,
    completedAt: row.completed_at,
  }));
}
