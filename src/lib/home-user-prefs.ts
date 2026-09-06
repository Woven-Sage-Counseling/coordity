import type { BulletinSurface } from './bulletin-board';
import { getBulletinBoardSettings, isBulletinSurface } from './bulletin-board';
import { nowMs } from './crypto';
import { getEnv } from './env';
import {
  COMPANY_WORDMARK_SRC,
  getHomeLayoutSettings,
  isBelowSlot,
  isRailSlot,
  normalizeHomeLayoutInput,
  PORTAL_MARK_SRC,
  serializeHomeLayout,
  slotsConflict,
  type HomeBelowSlot,
  type HomeLayoutSettings,
  type HomeRailSlot,
} from './home-layout';
import { DEFAULT_ORG_ID } from './organization';

export interface HomeUserPrefs {
  userId: string;
  orgId: string;
  surfaceOverride: BulletinSurface | null;
  railSlot: HomeRailSlot | null;
  belowSlot: HomeBelowSlot | null;
  updatedAt: number;
}

export interface EffectiveHomeComposition {
  railSlot: HomeRailSlot;
  belowSlot: HomeBelowSlot;
  surface: BulletinSurface;
  orgSurface: BulletinSurface;
  orgRailSlot: HomeRailSlot;
  orgBelowSlot: HomeBelowSlot;
  hasRailImage: boolean;
  railImageUrl: string | null;
  showRail: boolean;
  showRailBoard: boolean;
  showRailWidgets: boolean;
  showRailImage: boolean;
  showBelowBoard: boolean;
  showBelowWidgets: boolean;
  portalMarkSrc: string;
  companyWordmarkSrc: string;
}

type PrefsRow = {
  user_id: string;
  org_id: string;
  surface_override: string | null;
  rail_slot: string | null;
  below_slot: string | null;
  updated_at: number;
};

function mapPrefs(row: PrefsRow): HomeUserPrefs {
  return {
    userId: row.user_id,
    orgId: row.org_id,
    surfaceOverride:
      row.surface_override && isBulletinSurface(row.surface_override) ? row.surface_override : null,
    railSlot: row.rail_slot && isRailSlot(row.rail_slot) ? row.rail_slot : null,
    belowSlot: row.below_slot && isBelowSlot(row.below_slot) ? row.below_slot : null,
    updatedAt: row.updated_at,
  };
}

export async function getHomeUserPrefs(
  userId: string,
  orgId = DEFAULT_ORG_ID,
): Promise<HomeUserPrefs> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT user_id, org_id, surface_override, rail_slot, below_slot, updated_at
     FROM home_user_prefs WHERE user_id = ?`,
  )
    .bind(userId)
    .first<PrefsRow>();

  if (!row) {
    return {
      userId,
      orgId,
      surfaceOverride: null,
      railSlot: null,
      belowSlot: null,
      updatedAt: 0,
    };
  }
  return mapPrefs(row);
}

export async function updateHomeUserPrefs(input: {
  userId: string;
  orgId?: string;
  surfaceOverride?: BulletinSurface | null | '';
  railSlot?: HomeRailSlot | null | '';
  belowSlot?: HomeBelowSlot | null | '';
}): Promise<HomeUserPrefs> {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const existing = await getHomeUserPrefs(input.userId, orgId);
  const now = nowMs();

  const surfaceOverride =
    input.surfaceOverride === undefined
      ? existing.surfaceOverride
      : input.surfaceOverride === null || input.surfaceOverride === ''
        ? null
        : isBulletinSurface(input.surfaceOverride)
          ? input.surfaceOverride
          : null;

  const railSlot =
    input.railSlot === undefined
      ? existing.railSlot
      : input.railSlot === null || input.railSlot === ''
        ? null
        : isRailSlot(input.railSlot)
          ? input.railSlot
          : null;

  const belowSlot =
    input.belowSlot === undefined
      ? existing.belowSlot
      : input.belowSlot === null || input.belowSlot === ''
        ? null
        : isBelowSlot(input.belowSlot)
          ? input.belowSlot
          : null;

  const layout = await getHomeLayoutSettings(orgId);
  let effectiveRailSlot = railSlot;
  let effectiveBelowSlot = belowSlot;
  let effectiveSurface = surfaceOverride;

  // Prefer following company default when the chosen override matches it.
  if (effectiveRailSlot != null && effectiveRailSlot === layout.railSlot) {
    effectiveRailSlot = null;
  }
  if (effectiveBelowSlot != null && effectiveBelowSlot === layout.belowSlot) {
    effectiveBelowSlot = null;
  }
  if (effectiveSurface != null) {
    const board = await getBulletinBoardSettings(orgId);
    if (effectiveSurface === board.surface) effectiveSurface = null;
  }

  const resolvedRail = effectiveRailSlot ?? layout.railSlot;
  const resolvedBelow = effectiveBelowSlot ?? layout.belowSlot;
  if (slotsConflict(resolvedRail, resolvedBelow)) {
    throw new Error(
      'Bulletin board and widgets can each only appear in one place. Choose different options for the right header and bottom header.',
    );
  }

  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO home_user_prefs (user_id, org_id, surface_override, rail_slot, below_slot, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       org_id = excluded.org_id,
       surface_override = excluded.surface_override,
       rail_slot = excluded.rail_slot,
       below_slot = excluded.below_slot,
       updated_at = excluded.updated_at`,
  )
    .bind(input.userId, orgId, effectiveSurface, effectiveRailSlot, effectiveBelowSlot, now)
    .run();

  return getHomeUserPrefs(input.userId, orgId);
}

function resolveRailImageUrl(layout: HomeLayoutSettings, railSlot: HomeRailSlot): string | null {
  if (railSlot === 'portal') return PORTAL_MARK_SRC;
  if (railSlot === 'company') {
    return layout.hasRailImage ? '/api/home-layout/rail-image' : COMPANY_WORDMARK_SRC;
  }
  if (railSlot === 'custom') {
    return layout.hasRailImage ? '/api/home-layout/rail-image' : null;
  }
  return null;
}

export async function resolveEffectiveHomeComposition(input: {
  userId: string;
  orgId?: string;
}): Promise<EffectiveHomeComposition> {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const [layout, prefs, board] = await Promise.all([
    getHomeLayoutSettings(orgId),
    getHomeUserPrefs(input.userId, orgId),
    getBulletinBoardSettings(orgId),
  ]);

  const prefer: 'rail' | 'below' =
    prefs.railSlot != null && prefs.belowSlot == null
      ? 'rail'
      : prefs.belowSlot != null && prefs.railSlot == null
        ? 'below'
        : 'rail';
  const normalized = normalizeHomeLayoutInput({
    railSlot: prefs.railSlot ?? layout.railSlot,
    belowSlot: prefs.belowSlot ?? layout.belowSlot,
    prefer,
  });
  const railSlot = normalized.railSlot;
  const belowSlot = normalized.belowSlot;
  const surface = prefs.surfaceOverride ?? board.surface;
  const serialized = serializeHomeLayout(layout);

  return {
    railSlot,
    belowSlot,
    surface,
    orgSurface: board.surface,
    orgRailSlot: layout.railSlot,
    orgBelowSlot: layout.belowSlot,
    hasRailImage: layout.hasRailImage,
    railImageUrl: resolveRailImageUrl(layout, railSlot),
    showRail: railSlot !== 'none',
    showRailBoard: railSlot === 'board',
    showRailWidgets: railSlot === 'widgets',
    showRailImage: railSlot === 'company' || railSlot === 'portal' || railSlot === 'custom',
    showBelowBoard: belowSlot === 'board',
    showBelowWidgets: belowSlot === 'widgets',
    portalMarkSrc: serialized.portalMarkSrc,
    companyWordmarkSrc: serialized.companyWordmarkSrc,
  };
}

export function serializeHomeUserPrefs(prefs: HomeUserPrefs) {
  return {
    surfaceOverride: prefs.surfaceOverride,
    railSlot: prefs.railSlot,
    belowSlot: prefs.belowSlot,
  };
}
