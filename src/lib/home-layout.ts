import { nowMs } from './crypto';
import { getEnv } from './env';
import { DEFAULT_ORG_ID } from './organization';

export const HOME_BELOW_SLOTS = ['none', 'board', 'widgets'] as const;
export type HomeBelowSlot = (typeof HOME_BELOW_SLOTS)[number];

/** Single choice for the right rail. */
export const HOME_RAIL_SLOTS = ['none', 'board', 'widgets', 'company', 'portal', 'custom'] as const;
export type HomeRailSlot = (typeof HOME_RAIL_SLOTS)[number];

export const HOME_RAIL_IMAGE_KINDS = ['none', 'custom', 'company', 'portal'] as const;
export type HomeRailImageKind = (typeof HOME_RAIL_IMAGE_KINDS)[number];

export const BOARD_SHAPES = ['portrait', 'landscape'] as const;
export type BoardShape = (typeof BOARD_SHAPES)[number];

export interface HomeLayoutSettings {
  orgId: string;
  railSlot: HomeRailSlot;
  /** Derived from railSlot for older callers. */
  railBoard: boolean;
  railWidgets: boolean;
  railImageKind: HomeRailImageKind;
  hasRailImage: boolean;
  railImageMime: string | null;
  belowSlot: HomeBelowSlot;
  /** Soft hint only — shape is determined by which slot renders the board. */
  boardShape: BoardShape;
  updatedAt: number;
}

type LayoutRow = {
  org_id: string;
  rail_slot: string | null;
  rail_board: number;
  rail_widgets: number;
  rail_image_kind: string;
  rail_image_mime: string | null;
  rail_image_data: string | null;
  below_slot: string;
  board_shape: string;
  updated_at: number;
};

export const HOME_LAYOUT_IMAGE_MAX_BYTES = 1_200_000;
export const PORTAL_MARK_SRC = '/brand/portal-mark.png';
export const COMPANY_WORDMARK_SRC = '/brand/company-wordmark.png';

export function isBelowSlot(value: string): value is HomeBelowSlot {
  return (HOME_BELOW_SLOTS as readonly string[]).includes(value);
}

export function isRailSlot(value: string): value is HomeRailSlot {
  return (HOME_RAIL_SLOTS as readonly string[]).includes(value);
}

function isRailImageKind(value: string): value is HomeRailImageKind {
  return (HOME_RAIL_IMAGE_KINDS as readonly string[]).includes(value);
}

function isBoardShape(value: string): value is BoardShape {
  return (BOARD_SHAPES as readonly string[]).includes(value);
}

function deriveRailSlot(row: LayoutRow): HomeRailSlot {
  if (row.rail_slot && isRailSlot(row.rail_slot)) return row.rail_slot;
  if (row.rail_board === 1) return 'board';
  if (row.rail_widgets === 1) return 'widgets';
  if (isRailImageKind(row.rail_image_kind) && row.rail_image_kind !== 'none') {
    return row.rail_image_kind;
  }
  return 'none';
}

function railSlotToLegacy(slot: HomeRailSlot): {
  railBoard: boolean;
  railWidgets: boolean;
  railImageKind: HomeRailImageKind;
} {
  return {
    railBoard: slot === 'board',
    railWidgets: slot === 'widgets',
    railImageKind:
      slot === 'custom' || slot === 'company' || slot === 'portal' ? slot : 'none',
  };
}

function resolveBoardShapeHint(input: {
  railSlot: HomeRailSlot;
  belowSlot: HomeBelowSlot;
}): BoardShape {
  if (input.belowSlot === 'board') return 'landscape';
  if (input.railSlot === 'board') return 'portrait';
  return 'portrait';
}

function mapRow(row: LayoutRow): HomeLayoutSettings {
  const derivedRail = deriveRailSlot(row);
  const derivedBelow = isBelowSlot(row.below_slot) ? row.below_slot : 'widgets';
  const normalized = normalizeHomeLayoutInput({
    railSlot: derivedRail,
    belowSlot: derivedBelow,
    prefer: 'rail',
  });
  return {
    orgId: row.org_id,
    railSlot: normalized.railSlot,
    railBoard: normalized.railBoard,
    railWidgets: normalized.railWidgets,
    railImageKind: normalized.railImageKind,
    hasRailImage: Boolean(row.rail_image_data && row.rail_image_mime),
    railImageMime: row.rail_image_mime,
    belowSlot: normalized.belowSlot,
    boardShape: isBoardShape(row.board_shape)
      ? row.board_shape
      : normalized.boardShape,
    updatedAt: row.updated_at,
  };
}

/** True when board or widgets would appear in both rail and underneath. */
export function slotsConflict(railSlot: HomeRailSlot, belowSlot: HomeBelowSlot): boolean {
  return (
    (railSlot === 'board' && belowSlot === 'board') ||
    (railSlot === 'widgets' && belowSlot === 'widgets')
  );
}

/**
 * Normalize rail/below enums. Board and widgets may each appear in only one slot.
 * `prefer` decides which side wins when both request the same content type.
 */
export function normalizeHomeLayoutInput(input: {
  railSlot: HomeRailSlot;
  belowSlot: HomeBelowSlot;
  prefer?: 'rail' | 'below';
}): {
  railSlot: HomeRailSlot;
  belowSlot: HomeBelowSlot;
  boardShape: BoardShape;
  railBoard: boolean;
  railWidgets: boolean;
  railImageKind: HomeRailImageKind;
} {
  let railSlot = isRailSlot(input.railSlot) ? input.railSlot : 'none';
  let belowSlot = isBelowSlot(input.belowSlot) ? input.belowSlot : 'none';
  const prefer = input.prefer ?? 'below';

  if (slotsConflict(railSlot, belowSlot)) {
    if (prefer === 'rail') belowSlot = 'none';
    else railSlot = 'none';
  }

  const legacy = railSlotToLegacy(railSlot);
  return {
    railSlot,
    belowSlot,
    boardShape: resolveBoardShapeHint({ railSlot, belowSlot }),
    ...legacy,
  };
}

export function serializeHomeLayout(settings: HomeLayoutSettings) {
  const imageKind = settings.railImageKind;
  return {
    railSlot: settings.railSlot,
    railBoard: settings.railBoard,
    railWidgets: settings.railWidgets,
    railImageKind: imageKind,
    hasRailImage: settings.hasRailImage,
    railImageUrl:
      imageKind === 'custom' || imageKind === 'company'
        ? settings.hasRailImage
          ? '/api/home-layout/rail-image'
          : null
        : imageKind === 'portal'
          ? PORTAL_MARK_SRC
          : null,
    portalMarkSrc: PORTAL_MARK_SRC,
    companyWordmarkSrc: COMPANY_WORDMARK_SRC,
    belowSlot: settings.belowSlot,
    boardShape: settings.boardShape,
    showRail: settings.railSlot !== 'none',
  };
}

async function ensureHomeLayoutRow(orgId: string): Promise<void> {
  const { DB } = getEnv();
  const now = nowMs();
  await DB.prepare(
    `INSERT INTO home_layout (
       org_id, rail_board, rail_widgets, rail_image_kind, below_slot, board_shape, rail_slot, updated_at
     ) VALUES (?, 1, 0, 'none', 'widgets', 'portrait', 'board', ?)
     ON CONFLICT(org_id) DO NOTHING`,
  )
    .bind(orgId, now)
    .run();
}

export async function getHomeLayoutSettings(orgId = DEFAULT_ORG_ID): Promise<HomeLayoutSettings> {
  const { DB } = getEnv();
  await ensureHomeLayoutRow(orgId);
  const row = await DB.prepare(
    `SELECT org_id, rail_slot, rail_board, rail_widgets, rail_image_kind, rail_image_mime, rail_image_data,
            below_slot, board_shape, updated_at
     FROM home_layout WHERE org_id = ?`,
  )
    .bind(orgId)
    .first<LayoutRow>();

  if (!row) {
    return {
      orgId,
      railSlot: 'board',
      railBoard: true,
      railWidgets: false,
      railImageKind: 'none',
      hasRailImage: false,
      railImageMime: null,
      belowSlot: 'widgets',
      boardShape: 'portrait',
      updatedAt: nowMs(),
    };
  }
  return mapRow(row);
}

export async function getHomeLayoutRailImage(
  orgId = DEFAULT_ORG_ID,
): Promise<{ mime: string; dataBase64: string } | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT rail_slot, rail_image_kind, rail_image_mime, rail_image_data FROM home_layout WHERE org_id = ?`,
  )
    .bind(orgId)
    .first<{
      rail_slot: string | null;
      rail_image_kind: string;
      rail_image_mime: string | null;
      rail_image_data: string | null;
    }>();

  if (!row?.rail_image_data || !row.rail_image_mime) return null;
  const kind = row.rail_slot && isRailSlot(row.rail_slot) ? row.rail_slot : row.rail_image_kind;
  if (kind !== 'custom' && kind !== 'company') return null;
  return { mime: row.rail_image_mime, dataBase64: row.rail_image_data };
}

export async function updateHomeLayout(input: {
  orgId?: string;
  railSlot: HomeRailSlot;
  belowSlot: HomeBelowSlot;
  railImageMime?: string | null;
  railImageData?: string | null;
  clearRailImage?: boolean;
}): Promise<HomeLayoutSettings> {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const normalized = normalizeHomeLayoutInput({
    railSlot: input.railSlot,
    belowSlot: input.belowSlot,
  });

  const { DB } = getEnv();
  await ensureHomeLayoutRow(orgId);
  const existing = await getHomeLayoutSettings(orgId);
  const now = nowMs();

  const keepImage =
    normalized.railSlot === 'custom' || normalized.railSlot === 'company';

  let mimeToStore: string | null = existing.railImageMime;
  let dataToStore: string | null | 'KEEP' = 'KEEP';

  if (!keepImage || input.clearRailImage) {
    mimeToStore = null;
    dataToStore = null;
  } else if (input.railImageData && input.railImageMime) {
    mimeToStore = input.railImageMime;
    dataToStore = input.railImageData;
  }

  if (dataToStore === 'KEEP') {
    await DB.prepare(
      `UPDATE home_layout
       SET rail_slot = ?, rail_board = ?, rail_widgets = ?, rail_image_kind = ?,
           below_slot = ?, board_shape = ?, updated_at = ?
       WHERE org_id = ?`,
    )
      .bind(
        normalized.railSlot,
        normalized.railBoard ? 1 : 0,
        normalized.railWidgets ? 1 : 0,
        normalized.railImageKind,
        normalized.belowSlot,
        normalized.boardShape,
        now,
        orgId,
      )
      .run();
  } else {
    await DB.prepare(
      `UPDATE home_layout
       SET rail_slot = ?, rail_board = ?, rail_widgets = ?, rail_image_kind = ?,
           rail_image_mime = ?, rail_image_data = ?,
           below_slot = ?, board_shape = ?, updated_at = ?
       WHERE org_id = ?`,
    )
      .bind(
        normalized.railSlot,
        normalized.railBoard ? 1 : 0,
        normalized.railWidgets ? 1 : 0,
        normalized.railImageKind,
        mimeToStore,
        dataToStore,
        normalized.belowSlot,
        normalized.boardShape,
        now,
        orgId,
      )
      .run();
  }

  return getHomeLayoutSettings(orgId);
}

/**
 * Reflow pin % geometry when switching portrait ↔ landscape so items stay
 * on-canvas with roughly similar visual weight.
 */
export function reflowPinForShape(
  pin: { xPct: number; yPct: number; widthPct: number },
  from: BoardShape,
  to: BoardShape,
): { xPct: number; yPct: number; widthPct: number } {
  if (from === to) return { ...pin };

  if (from === 'portrait' && to === 'landscape') {
    return {
      xPct: clamp(pin.xPct * 0.92 + 4, -2, 88),
      yPct: clamp(12 + pin.yPct * 0.55, 2, 72),
      widthPct: clamp(pin.widthPct * 0.55, 8, 28),
    };
  }

  return {
    xPct: clamp(pin.xPct * 0.9 + 2, -2, 78),
    yPct: clamp(pin.yPct * 1.35 - 4, -2, 86),
    widthPct: clamp(pin.widthPct * 1.45, 10, 42),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** @deprecated Shape is per variant now; kept for twin seeding. */
export async function reflowBoardPinsForShape(input: {
  orgId?: string;
  from: BoardShape;
  to: BoardShape;
  variant?: BoardShape;
}): Promise<number> {
  if (input.from === input.to) return 0;
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const { DB } = getEnv();
  const now = nowMs();
  const variantClause = input.variant ? ' AND board_variant = ?' : '';
  const binds: Array<string | number> = [orgId];
  if (input.variant) binds.push(input.variant);

  const rows = await DB.prepare(
    `SELECT id, x_pct, y_pct, width_pct
     FROM bulletin_board_pin
     WHERE org_id = ? AND active = 1${variantClause}`,
  )
    .bind(...binds)
    .all<{ id: string; x_pct: number; y_pct: number; width_pct: number }>();

  let changed = 0;
  for (const row of rows.results ?? []) {
    const next = reflowPinForShape(
      { xPct: row.x_pct, yPct: row.y_pct, widthPct: row.width_pct },
      input.from,
      input.to,
    );
    await DB.prepare(
      `UPDATE bulletin_board_pin
       SET x_pct = ?, y_pct = ?, width_pct = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(next.xPct, next.yPct, next.widthPct, now, row.id)
      .run();
    changed += 1;
  }
  return changed;
}
