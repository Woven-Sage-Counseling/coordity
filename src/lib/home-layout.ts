import { nowMs } from './crypto';
import { getEnv } from './env';
import { DEFAULT_ORG_ID } from './organization';

export const HOME_BELOW_SLOTS = ['none', 'board', 'widgets'] as const;
export type HomeBelowSlot = (typeof HOME_BELOW_SLOTS)[number];

export const HOME_RAIL_IMAGE_KINDS = ['none', 'custom', 'company', 'portal'] as const;
export type HomeRailImageKind = (typeof HOME_RAIL_IMAGE_KINDS)[number];

export const BOARD_SHAPES = ['portrait', 'landscape'] as const;
export type BoardShape = (typeof BOARD_SHAPES)[number];

export interface HomeLayoutSettings {
  orgId: string;
  railBoard: boolean;
  railWidgets: boolean;
  railImageKind: HomeRailImageKind;
  hasRailImage: boolean;
  railImageMime: string | null;
  belowSlot: HomeBelowSlot;
  boardShape: BoardShape;
  updatedAt: number;
}

type LayoutRow = {
  org_id: string;
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

function isBelowSlot(value: string): value is HomeBelowSlot {
  return (HOME_BELOW_SLOTS as readonly string[]).includes(value);
}

function isRailImageKind(value: string): value is HomeRailImageKind {
  return (HOME_RAIL_IMAGE_KINDS as readonly string[]).includes(value);
}

function isBoardShape(value: string): value is BoardShape {
  return (BOARD_SHAPES as readonly string[]).includes(value);
}

function mapRow(row: LayoutRow): HomeLayoutSettings {
  return {
    orgId: row.org_id,
    railBoard: row.rail_board === 1,
    railWidgets: row.rail_widgets === 1,
    railImageKind: isRailImageKind(row.rail_image_kind) ? row.rail_image_kind : 'none',
    hasRailImage: Boolean(row.rail_image_data && row.rail_image_mime),
    railImageMime: row.rail_image_mime,
    belowSlot: isBelowSlot(row.below_slot) ? row.below_slot : 'widgets',
    boardShape: isBoardShape(row.board_shape) ? row.board_shape : 'portrait',
    updatedAt: row.updated_at,
  };
}

export function resolveBoardShape(input: {
  railBoard: boolean;
  belowSlot: HomeBelowSlot;
}): BoardShape {
  if (input.belowSlot === 'board') return 'landscape';
  if (input.railBoard) return 'portrait';
  return 'portrait';
}

/** Normalize conflicting placements so board/widgets live in one slot at a time. */
export function normalizeHomeLayoutInput(input: {
  railBoard: boolean;
  railWidgets: boolean;
  railImageKind: HomeRailImageKind;
  belowSlot: HomeBelowSlot;
}): {
  railBoard: boolean;
  railWidgets: boolean;
  railImageKind: HomeRailImageKind;
  belowSlot: HomeBelowSlot;
  boardShape: BoardShape;
} {
  let { railBoard, railWidgets, railImageKind, belowSlot } = input;

  if (belowSlot === 'board') railBoard = false;
  if (belowSlot === 'widgets') railWidgets = false;

  const railHasContent = railBoard || railWidgets;
  if (railHasContent && railImageKind !== 'none') {
    // Image is only for an empty rail; keep toggles and clear image kind.
    railImageKind = 'none';
  }
  if (!railHasContent && railImageKind === 'none') {
    // Empty rail with no image is fine.
  }

  return {
    railBoard,
    railWidgets,
    railImageKind,
    belowSlot,
    boardShape: resolveBoardShape({ railBoard, belowSlot }),
  };
}

export function serializeHomeLayout(settings: HomeLayoutSettings) {
  return {
    railBoard: settings.railBoard,
    railWidgets: settings.railWidgets,
    railImageKind: settings.railImageKind,
    hasRailImage: settings.hasRailImage,
    railImageUrl:
      settings.railImageKind === 'custom' || settings.railImageKind === 'company'
        ? settings.hasRailImage
          ? '/api/home-layout/rail-image'
          : null
        : settings.railImageKind === 'portal'
          ? PORTAL_MARK_SRC
          : null,
    portalMarkSrc: PORTAL_MARK_SRC,
    companyWordmarkSrc: COMPANY_WORDMARK_SRC,
    belowSlot: settings.belowSlot,
    boardShape: settings.boardShape,
    showRail: settings.railBoard || settings.railWidgets || settings.railImageKind !== 'none',
  };
}

async function ensureHomeLayoutRow(orgId: string): Promise<void> {
  const { DB } = getEnv();
  const now = nowMs();
  await DB.prepare(
    `INSERT INTO home_layout (
       org_id, rail_board, rail_widgets, rail_image_kind, below_slot, board_shape, updated_at
     ) VALUES (?, 1, 0, 'none', 'widgets', 'portrait', ?)
     ON CONFLICT(org_id) DO NOTHING`,
  )
    .bind(orgId, now)
    .run();
}

export async function getHomeLayoutSettings(orgId = DEFAULT_ORG_ID): Promise<HomeLayoutSettings> {
  const { DB } = getEnv();
  await ensureHomeLayoutRow(orgId);
  const row = await DB.prepare(
    `SELECT org_id, rail_board, rail_widgets, rail_image_kind, rail_image_mime, rail_image_data,
            below_slot, board_shape, updated_at
     FROM home_layout WHERE org_id = ?`,
  )
    .bind(orgId)
    .first<LayoutRow>();

  if (!row) {
    return {
      orgId,
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
    `SELECT rail_image_kind, rail_image_mime, rail_image_data FROM home_layout WHERE org_id = ?`,
  )
    .bind(orgId)
    .first<{
      rail_image_kind: string;
      rail_image_mime: string | null;
      rail_image_data: string | null;
    }>();

  if (!row?.rail_image_data || !row.rail_image_mime) return null;
  if (row.rail_image_kind !== 'custom' && row.rail_image_kind !== 'company') return null;
  return { mime: row.rail_image_mime, dataBase64: row.rail_image_data };
}

export async function updateHomeLayout(input: {
  orgId?: string;
  railBoard: boolean;
  railWidgets: boolean;
  railImageKind: HomeRailImageKind;
  belowSlot: HomeBelowSlot;
  railImageMime?: string | null;
  railImageData?: string | null;
  clearRailImage?: boolean;
}): Promise<HomeLayoutSettings> {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const normalized = normalizeHomeLayoutInput({
    railBoard: input.railBoard,
    railWidgets: input.railWidgets,
    railImageKind: input.railImageKind,
    belowSlot: input.belowSlot,
  });

  const { DB } = getEnv();
  await ensureHomeLayoutRow(orgId);
  const existing = await getHomeLayoutSettings(orgId);
  const now = nowMs();

  const keepImage =
    normalized.railImageKind === 'custom' || normalized.railImageKind === 'company';

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
       SET rail_board = ?, rail_widgets = ?, rail_image_kind = ?,
           below_slot = ?, board_shape = ?, updated_at = ?
       WHERE org_id = ?`,
    )
      .bind(
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
       SET rail_board = ?, rail_widgets = ?, rail_image_kind = ?,
           rail_image_mime = ?, rail_image_data = ?,
           below_slot = ?, board_shape = ?, updated_at = ?
       WHERE org_id = ?`,
    )
      .bind(
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
    // Tall → wide: pull items toward the horizontal band and shrink relative width.
    return {
      xPct: clamp(pin.xPct * 0.92 + 4, -2, 88),
      yPct: clamp(12 + pin.yPct * 0.55, 2, 72),
      widthPct: clamp(pin.widthPct * 0.55, 8, 28),
    };
  }

  // Wide → tall: restore vertical spread and slightly larger width.
  return {
    xPct: clamp(pin.xPct * 0.9 + 2, -2, 78),
    yPct: clamp(pin.yPct * 1.35 - 4, -2, 86),
    widthPct: clamp(pin.widthPct * 1.45, 10, 42),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function reflowBoardPinsForShape(input: {
  orgId?: string;
  from: BoardShape;
  to: BoardShape;
}): Promise<number> {
  if (input.from === input.to) return 0;
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const { DB } = getEnv();
  const now = nowMs();
  const rows = await DB.prepare(
    `SELECT id, x_pct, y_pct, width_pct, channel
     FROM bulletin_board_pin
     WHERE org_id = ? AND active = 1`,
  )
    .bind(orgId)
    .all<{ id: string; x_pct: number; y_pct: number; width_pct: number; channel: string }>();

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
