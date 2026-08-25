import { getEnv } from '../env';
import { nowMs } from '../crypto';
import { isScheduleRangeId, resolveScheduleRange } from './range';
import type {
  ResolvedScheduleRange,
  ScheduleCalendarOption,
  ScheduleConnection,
  ScheduleEvent,
  ScheduleRangeId,
  ScheduleSummary,
} from './types';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_CALENDAR = 'https://www.googleapis.com/calendar/v3';
const OAUTH_STATE_PREFIX = 'gcal-oauth:';
const READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const EVENT_CACHE_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

interface ConnectionRow {
  google_email: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  access_token_expires_at: number | null;
  refresh_token_expires_at: number | null;
  status: 'disconnected' | 'connected' | 'error';
  last_error: string | null;
}

interface CalendarListItem {
  id?: string;
  summary?: string;
  backgroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
}

interface GoogleEventItem {
  id?: string;
  summary?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export class GoogleCalendarProvider {
  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }

  authorizationUrl(state: string, redirectUri: string): string {
    const env = getEnv();
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      response_type: 'code',
      scope: READONLY_SCOPE,
      redirect_uri: redirectUri,
      state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    return `${GOOGLE_AUTH}?${params.toString()}`;
  }

  async saveOauthState(state: string, userId: string, returnTo: string): Promise<void> {
    const { SESSION } = getEnv();
    if (!SESSION) {
      throw new Error('SESSION binding is required for Google Calendar OAuth.');
    }
    await SESSION.put(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify({ userId, returnTo, createdAt: nowMs() }),
      { expirationTtl: 600 },
    );
  }

  async readOauthState(state: string): Promise<{ userId: string; returnTo: string } | null> {
    const { SESSION } = getEnv();
    const raw = await SESSION?.get(`${OAUTH_STATE_PREFIX}${state}`);
    if (!raw) return null;
    await SESSION?.delete(`${OAUTH_STATE_PREFIX}${state}`);
    try {
      const parsed = JSON.parse(raw) as { userId?: string; returnTo?: string };
      if (!parsed.userId) return null;
      return { userId: parsed.userId, returnTo: parsed.returnTo ?? '/' };
    } catch {
      return null;
    }
  }

  async exchangeCode(code: string, redirectUri: string, userId: string): Promise<void> {
    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google Calendar credentials are not configured.');
    }

    const tokens = await this.requestTokens(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
      }),
    );

    const email = await this.fetchGoogleEmail(tokens.access_token);
    await this.storeTokens(userId, tokens, email);
    await this.refreshCalendarList(userId);
  }

  async disconnect(userId: string): Promise<void> {
    const { DB } = getEnv();
    await DB.batch([
      DB.prepare(`DELETE FROM google_calendar_selection WHERE user_id = ?`).bind(userId),
      DB.prepare(`DELETE FROM google_calendar_event_cache WHERE user_id = ?`).bind(userId),
      DB.prepare(
        `UPDATE google_calendar_connection
         SET status = 'disconnected',
             google_email = NULL,
             access_token_encrypted = NULL,
             refresh_token_encrypted = NULL,
             access_token_expires_at = NULL,
             refresh_token_expires_at = NULL,
             last_error = NULL
         WHERE user_id = ?`,
      ).bind(userId),
    ]);
  }

  async getConnection(userId: string): Promise<ScheduleConnection> {
    const row = await this.connectionRow(userId);
    return {
      status: row?.status ?? 'disconnected',
      googleEmail: row?.google_email ?? null,
      lastError: row?.last_error ?? null,
      configured: this.isConfigured(),
    };
  }

  async listCalendars(userId: string): Promise<ScheduleCalendarOption[]> {
    const rows = await getEnv()
      .DB.prepare(
        `SELECT calendar_id, calendar_name, calendar_color, enabled, sort_order
         FROM google_calendar_selection
         WHERE user_id = ?
         ORDER BY sort_order ASC, calendar_name ASC`,
      )
      .bind(userId)
      .all<{
        calendar_id: string;
        calendar_name: string;
        calendar_color: string | null;
        enabled: number;
        sort_order: number;
      }>();

    return (rows.results ?? []).map((row) => ({
      id: row.calendar_id,
      name: row.calendar_name,
      color: row.calendar_color,
      primary: row.sort_order === 0,
      enabled: row.enabled === 1,
      sortOrder: row.sort_order,
    }));
  }

  async saveCalendarSelection(userId: string, enabledIds: string[]): Promise<void> {
    const { DB } = getEnv();
    const enabled = new Set(enabledIds);
    const rows = await DB.prepare(
      `SELECT calendar_id FROM google_calendar_selection WHERE user_id = ?`,
    )
      .bind(userId)
      .all<{ calendar_id: string }>();

    const statements = (rows.results ?? []).map((row) =>
      DB.prepare(
        `UPDATE google_calendar_selection SET enabled = ? WHERE user_id = ? AND calendar_id = ?`,
      ).bind(enabled.has(row.calendar_id) ? 1 : 0, userId, row.calendar_id),
    );

    if (statements.length > 0) {
      await DB.batch(statements);
    }

    await DB.prepare(`DELETE FROM google_calendar_event_cache WHERE user_id = ?`).bind(userId).run();
  }

  async getSummary(userId: string, rangeId: ScheduleRangeId = 'this_week'): Promise<ScheduleSummary> {
    const connection = await this.getConnection(userId);
    const range = resolveScheduleRange(rangeId);
    const calendars = await this.listCalendars(userId);

    if (connection.status !== 'connected') {
      return { connection, range, events: [], calendars };
    }

    try {
      const events = await this.getEvents(userId, range);
      return { connection, range, events, calendars };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load calendar events.';
      return {
        connection: { ...connection, status: 'error', lastError: message },
        range,
        events: [],
        calendars,
      };
    }
  }

  async getEvents(userId: string, range: ResolvedScheduleRange): Promise<ScheduleEvent[]> {
    const cached = await this.readEventCache(userId, range.id);
    if (cached) return cached;

    const enabledCalendars = (await this.listCalendars(userId)).filter((calendar) => calendar.enabled);
    if (enabledCalendars.length === 0) return [];

    const accessToken = await this.validAccessToken(userId);
    const calendarMap = new Map(enabledCalendars.map((calendar) => [calendar.id, calendar]));
    const batches = await Promise.all(
      enabledCalendars.map(async (calendar) => {
        const url = new URL(`${GOOGLE_CALENDAR}/calendars/${encodeURIComponent(calendar.id)}/events`);
        url.searchParams.set('timeMin', range.timeMin);
        url.searchParams.set('timeMax', range.timeMax);
        url.searchParams.set('singleEvents', 'true');
        url.searchParams.set('orderBy', 'startTime');
        url.searchParams.set('maxResults', '100');
        url.searchParams.set('showDeleted', 'false');

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`Google Calendar request failed (${response.status}): ${detail.slice(0, 200)}`);
        }

        const payload = (await response.json()) as { items?: GoogleEventItem[] };
        return (payload.items ?? []).map((item) => this.toScheduleEvent(item, calendarMap.get(calendar.id)!));
      }),
    );

    const events = batches
      .flat()
      .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));

    await this.writeEventCache(userId, range.id, events);
    await getEnv()
      .DB.prepare(
        `UPDATE google_calendar_connection
         SET status = 'connected', last_sync_at = ?, last_error = NULL
         WHERE user_id = ?`,
      )
      .bind(nowMs(), userId)
      .run();

    return events;
  }

  async refreshCalendarList(userId: string): Promise<void> {
    const accessToken = await this.validAccessToken(userId);
    const response = await fetch(`${GOOGLE_CALENDAR}/users/me/calendarList?minAccessRole=reader`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Unable to list Google calendars (${response.status}): ${detail.slice(0, 200)}`);
    }

    const payload = (await response.json()) as { items?: CalendarListItem[] };
    const items = payload.items ?? [];
    const { DB } = getEnv();
    const existing = await DB.prepare(
      `SELECT calendar_id, enabled FROM google_calendar_selection WHERE user_id = ?`,
    )
      .bind(userId)
      .all<{ calendar_id: string; enabled: number }>();
    const existingEnabled = new Map(
      (existing.results ?? []).map((row) => [row.calendar_id, row.enabled === 1]),
    );

    const statements = items.map((item, index) => {
      const calendarId = item.id ?? '';
      const enabled =
        existingEnabled.has(calendarId) ? (existingEnabled.get(calendarId) ? 1 : 0) : item.primary ? 1 : 0;
      return DB.prepare(
        `INSERT INTO google_calendar_selection
         (user_id, calendar_id, calendar_name, calendar_color, enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, calendar_id) DO UPDATE SET
           calendar_name = excluded.calendar_name,
           calendar_color = excluded.calendar_color,
           sort_order = excluded.sort_order`,
      ).bind(
        userId,
        calendarId,
        item.summary ?? 'Untitled calendar',
        item.backgroundColor ?? null,
        enabled,
        item.primary ? 0 : index + 1,
      );
    });

    if (statements.length > 0) {
      await DB.batch(statements);
    }

    await DB.prepare(`DELETE FROM google_calendar_event_cache WHERE user_id = ?`).bind(userId).run();
  }

  private toScheduleEvent(item: GoogleEventItem, calendar: ScheduleCalendarOption): ScheduleEvent {
    const allDay = Boolean(item.start?.date);
    const start = item.start?.dateTime ?? item.start?.date ?? '';
    const end = item.end?.dateTime ?? item.end?.date ?? '';
    return {
      id: `${calendar.id}:${item.id ?? start}:${item.summary ?? 'event'}`,
      title: item.summary?.trim() || '(No title)',
      start,
      end,
      allDay,
      calendarId: calendar.id,
      calendarName: calendar.name,
      calendarColor: calendar.color,
      htmlLink: item.htmlLink ?? null,
    };
  }

  private async connectionRow(userId: string): Promise<ConnectionRow | null> {
    return getEnv()
      .DB.prepare(
        `SELECT google_email, access_token_encrypted, refresh_token_encrypted,
                access_token_expires_at, refresh_token_expires_at, status, last_error
         FROM google_calendar_connection
         WHERE user_id = ?`,
      )
      .bind(userId)
      .first<ConnectionRow>();
  }

  private async ensureConnectionRow(userId: string): Promise<void> {
    await getEnv()
      .DB.prepare(
        `INSERT INTO google_calendar_connection (user_id, status)
         VALUES (?, 'disconnected')
         ON CONFLICT(user_id) DO NOTHING`,
      )
      .bind(userId)
      .run();
  }

  private async storeTokens(userId: string, tokens: TokenResponse, googleEmail: string | null): Promise<void> {
    await this.ensureConnectionRow(userId);
    const existing = await this.connectionRow(userId);
    const refreshPlain =
      tokens.refresh_token ??
      (existing?.refresh_token_encrypted ? await decryptSecret(existing.refresh_token_encrypted) : null);
    if (!refreshPlain) {
      throw new Error('Google did not return a refresh token. Disconnect and connect again.');
    }

    const accessExpires = nowMs() + tokens.expires_in * 1000 - 60_000;
    await getEnv()
      .DB.prepare(
        `UPDATE google_calendar_connection
         SET google_email = ?,
             access_token_encrypted = ?,
             refresh_token_encrypted = ?,
             access_token_expires_at = ?,
             connected_at = ?,
             status = 'connected',
             last_error = NULL
         WHERE user_id = ?`,
      )
      .bind(
        googleEmail,
        await encryptSecret(tokens.access_token),
        await encryptSecret(refreshPlain),
        accessExpires,
        nowMs(),
        userId,
      )
      .run();
  }

  private async requestTokens(body: URLSearchParams): Promise<TokenResponse> {
    const response = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google token exchange failed (${response.status}): ${detail.slice(0, 200)}`);
    }
    return (await response.json()) as TokenResponse;
  }

  private async fetchGoogleEmail(accessToken: string): Promise<string | null> {
    const response = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { email?: string };
    return payload.email ?? null;
  }

  private async validAccessToken(userId: string): Promise<string> {
    const row = await this.connectionRow(userId);
    if (!row?.access_token_encrypted || !row.refresh_token_encrypted) {
      throw new Error('Google Calendar is not connected.');
    }

    if (row.access_token_expires_at && row.access_token_expires_at > nowMs()) {
      return decryptSecret(row.access_token_encrypted);
    }

    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google Calendar credentials are not configured.');
    }

    const refreshToken = await decryptSecret(row.refresh_token_encrypted);
    const tokens = await this.requestTokens(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
      }),
    );

    const accessExpires = nowMs() + tokens.expires_in * 1000 - 60_000;
    await env.DB.prepare(
      `UPDATE google_calendar_connection
       SET access_token_encrypted = ?, access_token_expires_at = ?, status = 'connected', last_error = NULL
       WHERE user_id = ?`,
    )
      .bind(await encryptSecret(tokens.access_token), accessExpires, userId)
      .run();

    return tokens.access_token;
  }

  private async readEventCache(userId: string, rangeKey: string): Promise<ScheduleEvent[] | null> {
    const row = await getEnv()
      .DB.prepare(
        `SELECT payload, fetched_at FROM google_calendar_event_cache
         WHERE user_id = ? AND range_key = ?`,
      )
      .bind(userId, rangeKey)
      .first<{ payload: string; fetched_at: number }>();

    if (!row || nowMs() - row.fetched_at > EVENT_CACHE_MS) return null;
    try {
      return JSON.parse(row.payload) as ScheduleEvent[];
    } catch {
      return null;
    }
  }

  private async writeEventCache(userId: string, rangeKey: string, events: ScheduleEvent[]): Promise<void> {
    await getEnv()
      .DB.prepare(
        `INSERT INTO google_calendar_event_cache (user_id, range_key, payload, fetched_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, range_key) DO UPDATE SET
           payload = excluded.payload,
           fetched_at = excluded.fetched_at`,
      )
      .bind(userId, rangeKey, JSON.stringify(events), nowMs())
      .run();
  }
}

export function parseScheduleRangeParam(value: string | null | undefined): ScheduleRangeId {
  if (value && isScheduleRangeId(value)) return value;
  return 'this_week';
}

export function scheduleRangeOptions(): Array<{ id: ScheduleRangeId; label: string }> {
  return [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This week' },
    { id: 'next_7_days', label: 'Next 7 days' },
    { id: 'next_14_days', label: 'Next 14 days' },
  ];
}

export { jsonResponse };
