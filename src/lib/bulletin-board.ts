import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';
import { DEFAULT_ORG_ID } from './organization';

export const BULLETIN_SURFACES = ['cork', 'blackboard', 'whiteboard'] as const;
export type BulletinSurface = (typeof BULLETIN_SURFACES)[number];

export const BULLETIN_KINDS = ['text', 'image', 'pdf'] as const;
export type BulletinKind = (typeof BULLETIN_KINDS)[number];

export const BULLETIN_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type BulletinRequestStatus = (typeof BULLETIN_REQUEST_STATUSES)[number];

export const BULLETIN_COLORS: Record<BulletinSurface, string[]> = {
  cork: ['#fef3c7', '#fecdd3', '#bfdbfe', '#bbf7d0', '#f5f5f4'],
  blackboard: ['#f8fafc', '#fde68a', '#a5f3fc', '#f9a8d4', '#d9f99d'],
  whiteboard: ['#111827', '#1d4ed8', '#dc2626', '#15803d', '#7c3aed'],
};

export function defaultColorForSurface(surface: BulletinSurface): string {
  return BULLETIN_COLORS[surface][0]!;
}

export function defaultFontSizeForSurface(surface: BulletinSurface): number {
  if (surface === 'blackboard') return 1.35;
  return 1.05;
}

export function clampFontSizeRem(value: number): number {
  return clamp(value, 0.65, 2.8);
}

/** Map a pin color onto the active surface palette (by palette index). */
export function mapColorToSurface(color: string, surface: BulletinSurface): string {
  const normalized = color.trim().toLowerCase();
  const palette = BULLETIN_COLORS[surface];
  const direct = palette.find((entry) => entry.toLowerCase() === normalized);
  if (direct) return direct;

  for (const other of BULLETIN_SURFACES) {
    const idx = BULLETIN_COLORS[other].findIndex((entry) => entry.toLowerCase() === normalized);
    if (idx >= 0) return palette[idx] ?? defaultColorForSurface(surface);
  }
  return defaultColorForSurface(surface);
}

export function isBulletinSurface(value: string): value is BulletinSurface {
  return (BULLETIN_SURFACES as readonly string[]).includes(value);
}

export function writingModeForSurface(surface: BulletinSurface): 'sticky' | 'chalk' | 'marker' {
  if (surface === 'blackboard') return 'chalk';
  if (surface === 'whiteboard') return 'marker';
  return 'sticky';
}

export interface BulletinBoardSettings {
  orgId: string;
  surface: BulletinSurface;
  updatedAt: number;
}

export interface BulletinBoardRequest {
  id: string;
  orgId: string;
  submittedBy: string;
  submitterName: string;
  kind: BulletinKind;
  body: string | null;
  fileName: string | null;
  fileMime: string | null;
  hasFile: boolean;
  status: BulletinRequestStatus;
  createdAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
  reviewNote: string | null;
}

export interface BulletinBoardPin {
  id: string;
  orgId: string;
  requestId: string | null;
  kind: BulletinKind;
  body: string | null;
  fileName: string | null;
  fileMime: string | null;
  hasFile: boolean;
  xPct: number;
  yPct: number;
  widthPct: number;
  rotationDeg: number;
  color: string;
  fontSizeRem: number;
  zIndex: number;
  expiresAt: number | null;
  active: boolean;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

type SettingsRow = { org_id: string; surface: string; updated_at: number };
type RequestRow = {
  id: string;
  org_id: string;
  submitted_by: string;
  submitter_name: string | null;
  kind: string;
  body: string | null;
  file_name: string | null;
  file_mime: string | null;
  has_file: number;
  status: string;
  created_at: number;
  reviewed_at: number | null;
  reviewed_by: string | null;
  review_note: string | null;
};
type PinRow = {
  id: string;
  org_id: string;
  request_id: string | null;
  kind: string;
  body: string | null;
  file_name: string | null;
  file_mime: string | null;
  has_file: number;
  x_pct: number;
  y_pct: number;
  width_pct: number;
  rotation_deg: number;
  color: string;
  font_size_rem: number | null;
  z_index: number;
  expires_at: number | null;
  active: number;
  created_by: string | null;
  created_at: number;
  updated_at: number;
};

function mapRequest(row: RequestRow): BulletinBoardRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    submittedBy: row.submitted_by,
    submitterName: row.submitter_name ?? 'Unknown',
    kind: row.kind as BulletinKind,
    body: row.body,
    fileName: row.file_name,
    fileMime: row.file_mime,
    hasFile: row.has_file === 1,
    status: row.status as BulletinRequestStatus,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
  };
}

function mapPin(row: PinRow): BulletinBoardPin {
  return {
    id: row.id,
    orgId: row.org_id,
    requestId: row.request_id,
    kind: row.kind as BulletinKind,
    body: row.body,
    fileName: row.file_name,
    fileMime: row.file_mime,
    hasFile: row.has_file === 1,
    xPct: row.x_pct,
    yPct: row.y_pct,
    widthPct: row.width_pct,
    rotationDeg: row.rotation_deg,
    color: row.color,
    fontSizeRem: clampFontSizeRem(
      typeof row.font_size_rem === 'number' && Number.isFinite(row.font_size_rem)
        ? row.font_size_rem
        : 1.05,
    ),
    zIndex: row.z_index,
    expiresAt: row.expires_at,
    active: row.active === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getBulletinBoardSettings(orgId = DEFAULT_ORG_ID): Promise<BulletinBoardSettings> {
  const { DB } = getEnv();
  const row = await DB.prepare(`SELECT org_id, surface, updated_at FROM bulletin_board WHERE org_id = ?`)
    .bind(orgId)
    .first<SettingsRow>();

  if (row && isBulletinSurface(row.surface)) {
    return { orgId: row.org_id, surface: row.surface, updatedAt: row.updated_at };
  }

  const now = nowMs();
  await DB.prepare(
    `INSERT INTO bulletin_board (org_id, surface, updated_at) VALUES (?, 'cork', ?)
     ON CONFLICT(org_id) DO NOTHING`,
  )
    .bind(orgId, now)
    .run();

  return { orgId, surface: 'cork', updatedAt: now };
}

export async function setBulletinBoardSurface(
  surface: BulletinSurface,
  orgId = DEFAULT_ORG_ID,
): Promise<BulletinBoardSettings> {
  const now = nowMs();
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO bulletin_board (org_id, surface, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(org_id) DO UPDATE SET surface = excluded.surface, updated_at = excluded.updated_at`,
  )
    .bind(orgId, surface, now)
    .run();

  // Remap stored pin colors onto the new surface palette so sticky yellow
  // does not become yellow chalk/marker after a surface change.
  const pins = await DB.prepare(
    `SELECT id, color FROM bulletin_board_pin WHERE org_id = ? AND active = 1`,
  )
    .bind(orgId)
    .all<{ id: string; color: string }>();

  for (const pin of pins.results ?? []) {
    const nextColor = mapColorToSurface(pin.color, surface);
    if (nextColor.toLowerCase() === pin.color.trim().toLowerCase()) continue;
    await DB.prepare(`UPDATE bulletin_board_pin SET color = ?, updated_at = ? WHERE id = ?`)
      .bind(nextColor, now, pin.id)
      .run();
  }

  return { orgId, surface, updatedAt: now };
}

export async function listBulletinBoardRequests(
  options: { status?: BulletinRequestStatus; orgId?: string; limit?: number } = {},
): Promise<BulletinBoardRequest[]> {
  const orgId = options.orgId ?? DEFAULT_ORG_ID;
  const limit = options.limit ?? 50;
  const { DB } = getEnv();

  const clauses = ['r.org_id = ?'];
  const binds: Array<string | number> = [orgId];
  if (options.status) {
    clauses.push('r.status = ?');
    binds.push(options.status);
  }
  binds.push(limit);

  const rows = await DB.prepare(
    `SELECT r.id, r.org_id, r.submitted_by, u.name AS submitter_name, r.kind, r.body,
            r.file_name, r.file_mime,
            CASE WHEN r.file_data IS NOT NULL AND r.file_data != '' THEN 1 ELSE 0 END AS has_file,
            r.status, r.created_at, r.reviewed_at, r.reviewed_by, r.review_note
     FROM bulletin_board_request r
     LEFT JOIN user u ON u.id = r.submitted_by
     WHERE ${clauses.join(' AND ')}
     ORDER BY r.created_at DESC
     LIMIT ?`,
  )
    .bind(...binds)
    .all<RequestRow>();

  return (rows.results ?? []).map(mapRequest);
}

export async function createBulletinBoardRequest(input: {
  orgId?: string;
  submittedBy: string;
  kind: BulletinKind;
  body?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileData?: string | null;
}): Promise<BulletinBoardRequest> {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const body = input.body?.trim() || null;
  if (input.kind === 'text' && !body) {
    throw new Error('Write something for the sticky note.');
  }
  if ((input.kind === 'image' || input.kind === 'pdf') && !input.fileData) {
    throw new Error('Upload a file for this request.');
  }

  const id = randomToken(16);
  const now = nowMs();
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO bulletin_board_request
       (id, org_id, submitted_by, kind, body, file_name, file_mime, file_data, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  )
    .bind(
      id,
      orgId,
      input.submittedBy,
      input.kind,
      body,
      input.fileName ?? null,
      input.fileMime ?? null,
      input.fileData ?? null,
      now,
    )
    .run();

  const row = await DB.prepare(
    `SELECT r.id, r.org_id, r.submitted_by, u.name AS submitter_name, r.kind, r.body,
            r.file_name, r.file_mime,
            CASE WHEN r.file_data IS NOT NULL AND r.file_data != '' THEN 1 ELSE 0 END AS has_file,
            r.status, r.created_at, r.reviewed_at, r.reviewed_by, r.review_note
     FROM bulletin_board_request r
     LEFT JOIN user u ON u.id = r.submitted_by
     WHERE r.id = ?`,
  )
    .bind(id)
    .first<RequestRow>();

  if (!row) throw new Error('Could not create board request.');
  return mapRequest(row);
}

export async function rejectBulletinBoardRequest(input: {
  id: string;
  reviewedBy: string;
  note?: string;
}): Promise<void> {
  const { DB } = getEnv();
  const existing = await DB.prepare(`SELECT id, status FROM bulletin_board_request WHERE id = ?`)
    .bind(input.id)
    .first<{ id: string; status: string }>();
  if (!existing || existing.status !== 'pending') {
    throw new Error('Request not found or already reviewed.');
  }
  await DB.prepare(
    `UPDATE bulletin_board_request
     SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, review_note = ?
     WHERE id = ?`,
  )
    .bind(nowMs(), input.reviewedBy, input.note?.trim() || null, input.id)
    .run();
}

export async function listBulletinBoardPins(orgId = DEFAULT_ORG_ID): Promise<BulletinBoardPin[]> {
  const { DB } = getEnv();
  const now = nowMs();
  const rows = await DB.prepare(
    `SELECT id, org_id, request_id, kind, body, file_name, file_mime,
            CASE WHEN file_data IS NOT NULL AND file_data != '' THEN 1 ELSE 0 END AS has_file,
            x_pct, y_pct, width_pct, rotation_deg, color, font_size_rem, z_index, expires_at, active,
            created_by, created_at, updated_at
     FROM bulletin_board_pin
     WHERE org_id = ?
       AND active = 1
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY z_index ASC, created_at ASC`,
  )
    .bind(orgId, now)
    .all<PinRow>();

  return (rows.results ?? []).map(mapPin);
}

async function nextZIndex(orgId: string): Promise<number> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT COALESCE(MAX(z_index), 0) AS max_z FROM bulletin_board_pin WHERE org_id = ? AND active = 1`,
  )
    .bind(orgId)
    .first<{ max_z: number }>();
  return (row?.max_z ?? 0) + 1;
}

export async function placePinFromRequest(input: {
  requestId: string;
  createdBy: string;
  orgId?: string;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  rotationDeg?: number;
  color?: string;
  fontSizeRem?: number;
  expiresAt?: number | null;
}): Promise<BulletinBoardPin> {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const settings = await getBulletinBoardSettings(orgId);
  const { DB } = getEnv();

  const request = await DB.prepare(
    `SELECT id, org_id, kind, body, file_name, file_mime, file_data, status
     FROM bulletin_board_request WHERE id = ? AND org_id = ?`,
  )
    .bind(input.requestId, orgId)
    .first<{
      id: string;
      org_id: string;
      kind: string;
      body: string | null;
      file_name: string | null;
      file_mime: string | null;
      file_data: string | null;
      status: string;
    }>();

  if (!request || request.status !== 'pending') {
    throw new Error('Request not found or already reviewed.');
  }

  const id = randomToken(16);
  const now = nowMs();
  const color = mapColorToSurface(
    input.color ?? defaultColorForSurface(settings.surface),
    settings.surface,
  );
  const fontSizeRem = clampFontSizeRem(
    input.fontSizeRem ?? defaultFontSizeForSurface(settings.surface),
  );
  const zIndex = await nextZIndex(orgId);

  await DB.prepare(
    `INSERT INTO bulletin_board_pin
       (id, org_id, request_id, kind, body, file_name, file_mime, file_data,
        x_pct, y_pct, width_pct, rotation_deg, color, font_size_rem, z_index, expires_at, active,
        created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  )
    .bind(
      id,
      orgId,
      request.id,
      request.kind,
      request.body,
      request.file_name,
      request.file_mime,
      request.file_data,
      input.xPct ?? 38,
      input.yPct ?? 36,
      input.widthPct ?? (request.kind === 'text' ? 24 : 28),
      input.rotationDeg ?? (Math.random() * 10 - 5),
      color,
      fontSizeRem,
      zIndex,
      input.expiresAt ?? null,
      input.createdBy,
      now,
      now,
    )
    .run();

  await DB.prepare(
    `UPDATE bulletin_board_request
     SET status = 'approved', reviewed_at = ?, reviewed_by = ?
     WHERE id = ?`,
  )
    .bind(now, input.createdBy, request.id)
    .run();

  const pins = await listBulletinBoardPins(orgId);
  const pin = pins.find((item) => item.id === id);
  if (!pin) throw new Error('Could not place pin.');
  return pin;
}

export async function createDirectPin(input: {
  orgId?: string;
  createdBy: string;
  kind: BulletinKind;
  body?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileData?: string | null;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  rotationDeg?: number;
  color?: string;
  fontSizeRem?: number;
  expiresAt?: number | null;
}): Promise<BulletinBoardPin> {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const settings = await getBulletinBoardSettings(orgId);
  const body = input.body?.trim() || null;
  if (input.kind === 'text' && !body) throw new Error('Write something for the note.');

  const id = randomToken(16);
  const now = nowMs();
  const zIndex = await nextZIndex(orgId);
  const { DB } = getEnv();
  const fontSizeRem = clampFontSizeRem(
    input.fontSizeRem ?? defaultFontSizeForSurface(settings.surface),
  );

  await DB.prepare(
    `INSERT INTO bulletin_board_pin
       (id, org_id, request_id, kind, body, file_name, file_mime, file_data,
        x_pct, y_pct, width_pct, rotation_deg, color, font_size_rem, z_index, expires_at, active,
        created_by, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  )
    .bind(
      id,
      orgId,
      input.kind,
      body,
      input.fileName ?? null,
      input.fileMime ?? null,
      input.fileData ?? null,
      input.xPct ?? 40,
      input.yPct ?? 40,
      input.widthPct ?? 22,
      input.rotationDeg ?? 0,
      mapColorToSurface(
        input.color ?? defaultColorForSurface(settings.surface),
        settings.surface,
      ),
      fontSizeRem,
      zIndex,
      input.expiresAt ?? null,
      input.createdBy,
      now,
      now,
    )
    .run();

  const pins = await listBulletinBoardPins(orgId);
  const pin = pins.find((item) => item.id === id);
  if (!pin) throw new Error('Could not create pin.');
  return pin;
}

export async function updateBulletinBoardPin(input: {
  id: string;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  rotationDeg?: number;
  color?: string;
  fontSizeRem?: number;
  body?: string | null;
  expiresAt?: number | null;
  clearExpires?: boolean;
}): Promise<BulletinBoardPin> {
  const { DB } = getEnv();
  const existing = await DB.prepare(
    `SELECT id, org_id, request_id, kind, body, file_name, file_mime,
            CASE WHEN file_data IS NOT NULL AND file_data != '' THEN 1 ELSE 0 END AS has_file,
            x_pct, y_pct, width_pct, rotation_deg, color, font_size_rem, z_index, expires_at, active,
            created_by, created_at, updated_at
     FROM bulletin_board_pin WHERE id = ? AND active = 1`,
  )
    .bind(input.id)
    .first<PinRow>();

  if (!existing) throw new Error('Pin not found.');

  const settings = await getBulletinBoardSettings(existing.org_id);
  const existingFont =
    typeof existing.font_size_rem === 'number' && Number.isFinite(existing.font_size_rem)
      ? existing.font_size_rem
      : defaultFontSizeForSurface(settings.surface);
  const next = {
    xPct: input.xPct ?? existing.x_pct,
    yPct: input.yPct ?? existing.y_pct,
    widthPct: input.widthPct ?? existing.width_pct,
    rotationDeg: input.rotationDeg ?? existing.rotation_deg,
    color: mapColorToSurface(input.color ?? existing.color, settings.surface),
    fontSizeRem: clampFontSizeRem(input.fontSizeRem ?? existingFont),
    body: input.body !== undefined ? input.body : existing.body,
    expiresAt: input.clearExpires
      ? null
      : input.expiresAt !== undefined
        ? input.expiresAt
        : existing.expires_at,
  };

  const now = nowMs();
  await DB.prepare(
    `UPDATE bulletin_board_pin
     SET x_pct = ?, y_pct = ?, width_pct = ?, rotation_deg = ?, color = ?, font_size_rem = ?, body = ?, expires_at = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      clamp(next.xPct, -5, 95),
      clamp(next.yPct, -5, 95),
      clamp(next.widthPct, 8, 60),
      next.rotationDeg,
      next.color,
      next.fontSizeRem,
      next.body,
      next.expiresAt,
      now,
      input.id,
    )
    .run();

  return {
    ...mapPin(existing),
    ...next,
    updatedAt: now,
  };
}

export async function removeBulletinBoardPin(id: string): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(`UPDATE bulletin_board_pin SET active = 0, updated_at = ? WHERE id = ?`)
    .bind(nowMs(), id)
    .run();
}

export async function getBulletinPinFile(id: string): Promise<{ mime: string; dataBase64: string; fileName: string | null } | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT file_mime, file_data, file_name FROM bulletin_board_pin WHERE id = ? AND active = 1`,
  )
    .bind(id)
    .first<{ file_mime: string | null; file_data: string | null; file_name: string | null }>();
  if (!row?.file_data || !row.file_mime) return null;
  return { mime: row.file_mime, dataBase64: row.file_data, fileName: row.file_name };
}

export async function getBulletinRequestFile(
  id: string,
): Promise<{ mime: string; dataBase64: string; fileName: string | null } | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT file_mime, file_data, file_name FROM bulletin_board_request WHERE id = ?`,
  )
    .bind(id)
    .first<{ file_mime: string | null; file_data: string | null; file_name: string | null }>();
  if (!row?.file_data || !row.file_mime) return null;
  return { mime: row.file_mime, dataBase64: row.file_data, fileName: row.file_name };
}

export function serializePin(pin: BulletinBoardPin, surface?: BulletinSurface) {
  const color = surface ? mapColorToSurface(pin.color, surface) : pin.color;
  return {
    id: pin.id,
    requestId: pin.requestId,
    kind: pin.kind,
    body: pin.body,
    fileName: pin.fileName,
    fileMime: pin.fileMime,
    hasFile: pin.hasFile,
    xPct: pin.xPct,
    yPct: pin.yPct,
    widthPct: pin.widthPct,
    rotationDeg: pin.rotationDeg,
    color,
    fontSizeRem: pin.fontSizeRem,
    zIndex: pin.zIndex,
    expiresAt: pin.expiresAt,
    fileUrl: pin.hasFile ? `/api/bulletin-board/file/pin/${pin.id}` : null,
  };
}

export function serializeRequest(request: BulletinBoardRequest) {
  return {
    id: request.id,
    submitterName: request.submitterName,
    kind: request.kind,
    body: request.body,
    fileName: request.fileName,
    fileMime: request.fileMime,
    hasFile: request.hasFile,
    status: request.status,
    createdAt: request.createdAt,
    fileUrl: request.hasFile ? `/api/bulletin-board/file/request/${request.id}` : null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const BULLETIN_MAX_IMAGE_BYTES = 400_000;
export const BULLETIN_MAX_PDF_BYTES = 700_000;
