import { listBulletinBoardPins, type BulletinBoardPin } from './bulletin-board';
import {
  canLookupAnyProvider,
  getProviderForUser,
  listProviderCoverage,
  listProvidersForLookup,
  type CredentialingProvider,
  type ProviderCoverageRow,
} from './credentialing';
import { getFinancialSummary } from './financials/summary';
import type { FinancialSummary } from './financials/types';
import { listProgressTracksForUser, type ProgressTrack } from './progress';
import { getScheduleSummary } from './schedule/summary';
import type { ScheduleSummary } from './schedule/types';
import { listTasksForUser, type UserTask } from './tasks';
import { getTimesheetSummary, type TimesheetSummary } from './timesheet-entries';
import { buildWorkCategoryLookup, getWorkCategoryLookup, type WorkCategoryLookup } from './timesheet-work-categories';
import { isUserOnApprovedTimeOffNow, listTimeOffRequestsForUser, type TimeOffRequest } from './time-off-requests';

export interface HomeTimesheetPrepared {
  summary: TimesheetSummary | null;
  error: string | null;
  categoryLookup: WorkCategoryLookup;
  onTimeOff: boolean;
}

export interface HomeCredentialingPrepared {
  providers: CredentialingProvider[];
  linkedProvider: CredentialingProvider | null;
  coverage: ProviderCoverageRow[];
}

export interface HomePrepared {
  schedule: ScheduleSummary | null;
  timeOff: TimeOffRequest[];
  timesheet: HomeTimesheetPrepared;
  onTimeOff: boolean;
  tracks: ProgressTrack[];
  tasks: UserTask[];
  credentialing: HomeCredentialingPrepared | null;
  financials: FinancialSummary | null;
  bulletinLandscape: BulletinBoardPin[];
  bulletinPortrait: BulletinBoardPin[];
}

async function settle<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(label, error);
    return fallback;
  }
}

export async function loadHomePrepared(input: {
  userId: string;
  orgId: string;
  roleKeys: string[];
  employee: PortalEmployee;
  canSeeFinancials: boolean;
  canSeeCredentialing: boolean;
  canSeeTimesheet: boolean;
}): Promise<HomePrepared> {
  const [schedule, timeOff, timesheet, onTimeOff, tracks, tasks, credentialing, financials, bulletinLandscape, bulletinPortrait] =
    await Promise.all([
      settle('home schedule', () => getScheduleSummary(input.userId, 'this_week', { preferCache: true }), null),
      settle('home time off', () => listTimeOffRequestsForUser(input.userId, 8), []),
      input.canSeeTimesheet
        ? (async (): Promise<HomeTimesheetPrepared> => {
            const [summaryResult, categoryLookup] = await Promise.all([
              getTimesheetSummary(input.userId)
                .then((summary) => ({ summary, error: null as string | null }))
                .catch((error) => {
                  console.error('timesheet widget load failed', error);
                  return {
                    summary: null,
                    error: 'Timesheet is temporarily unavailable.',
                  };
                }),
              settle('home work categories', () => getWorkCategoryLookup(input.orgId), buildWorkCategoryLookup([])),
            ]);
            return {
              summary: summaryResult.summary,
              error: summaryResult.error,
              categoryLookup,
              onTimeOff: false,
            };
          })()
        : Promise.resolve({
            summary: null,
            error: null,
            categoryLookup: buildWorkCategoryLookup([]),
            onTimeOff: false,
          }),
      isUserOnApprovedTimeOffNow(input.userId).catch(() => false),
      settle('home progress', () =>
        listProgressTracksForUser(input.userId, { orgId: input.orgId, roleKeys: input.roleKeys }),
      []),
      settle('home tasks', () => listTasksForUser(input.userId, 50), []),
      input.canSeeCredentialing
        ? settle(
            'home credentialing',
            async () => {
              const canPick = canLookupAnyProvider(input.employee);
              const [providers, linkedProvider] = await Promise.all([
                canPick ? listProvidersForLookup() : Promise.resolve([]),
                getProviderForUser(input.userId),
              ]);
              const initialProviderId = canPick
                ? (providers[0]?.id ?? '')
                : (linkedProvider?.id ?? '');
              const coverage =
                initialProviderId.length > 0
                  ? await listProviderCoverage(initialProviderId, { publicOnly: true })
                  : [];
              return { providers, linkedProvider, coverage };
            },
            { providers: [], linkedProvider: null, coverage: [] },
          )
        : Promise.resolve(null),
      input.canSeeFinancials
        ? settle('home financials', () => getFinancialSummary(null, { cachedOnly: true, orgId: input.orgId }), null)
        : Promise.resolve(null),
      settle(
        'home bulletin landscape',
        () => listBulletinBoardPins({ orgId: input.orgId, channel: 'live', variant: 'landscape' }),
        [],
      ),
      settle(
        'home bulletin portrait',
        () => listBulletinBoardPins({ orgId: input.orgId, channel: 'live', variant: 'portrait' }),
        [],
      ),
    ]);

  return {
    schedule,
    timeOff,
    timesheet: { ...timesheet, onTimeOff },
    onTimeOff,
    tracks,
    tasks,
    credentialing,
    financials,
    bulletinLandscape,
    bulletinPortrait,
  };
}
