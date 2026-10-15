import { nowMs } from './crypto';
import { getEnv } from './env';

export interface AppPortalTheme {
  background: string;
  surface: string;
  accent: string;
  ink: string;
}

export const DEFAULT_APP_PORTAL: AppPortalTheme = {
  background: '#F4F5F8',
  surface: '#FFFFFF',
  accent: '#535F51',
  ink: '#3A3A38',
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function normalizePortalHex(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  if (!HEX.test(raw)) return fallback;
  return raw.toUpperCase();
}

export function themeFromFields(input: Partial<AppPortalTheme> | null | undefined): AppPortalTheme {
  return {
    background: normalizePortalHex(input?.background, DEFAULT_APP_PORTAL.background),
    surface: normalizePortalHex(input?.surface, DEFAULT_APP_PORTAL.surface),
    accent: normalizePortalHex(input?.accent, DEFAULT_APP_PORTAL.accent),
    ink: normalizePortalHex(input?.ink, DEFAULT_APP_PORTAL.ink),
  };
}

async function ensureAppPortalTable(): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `CREATE TABLE IF NOT EXISTS app_portal (
      org_id TEXT PRIMARY KEY,
      background TEXT NOT NULL,
      surface TEXT NOT NULL,
      accent TEXT NOT NULL,
      ink TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ).run();
}

export async function getAppPortalTheme(orgId: string): Promise<{ theme: AppPortalTheme; customized: boolean }> {
  try {
    await ensureAppPortalTable();
    const { DB } = getEnv();
    const row = await DB.prepare(
      `SELECT background, surface, accent, ink FROM app_portal WHERE org_id = ?`,
    )
      .bind(orgId)
      .first<AppPortalTheme>();
    if (!row) return { theme: { ...DEFAULT_APP_PORTAL }, customized: false };
    return { theme: themeFromFields(row), customized: true };
  } catch (error) {
    console.error('app portal theme read failed', error);
    return { theme: { ...DEFAULT_APP_PORTAL }, customized: false };
  }
}

export async function saveAppPortalTheme(orgId: string, input: Partial<AppPortalTheme>): Promise<AppPortalTheme> {
  const theme = themeFromFields(input);
  await ensureAppPortalTable();
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO app_portal (org_id, background, surface, accent, ink, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(org_id) DO UPDATE SET
       background = excluded.background,
       surface = excluded.surface,
       accent = excluded.accent,
       ink = excluded.ink,
       updated_at = excluded.updated_at`,
  )
    .bind(orgId, theme.background, theme.surface, theme.accent, theme.ink, nowMs())
    .run();
  return theme;
}
