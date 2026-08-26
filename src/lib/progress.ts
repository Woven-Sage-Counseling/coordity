import { getEnv } from './env';

export interface ProgressStep {
  id: string;
  label: string;
  done: boolean;
  href?: string;
}

export interface ProgressTrack {
  id: string;
  label: string;
  description: string;
  steps: ProgressStep[];
  completed: number;
  total: number;
  percent: number;
}

function trackFromSteps(
  id: string,
  label: string,
  description: string,
  steps: ProgressStep[],
): ProgressTrack {
  const completed = steps.filter((step) => step.done).length;
  const total = steps.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { id, label, description, steps, completed, total, percent };
}

async function hasAvatar(userId: string): Promise<boolean> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT 1 AS ok
     FROM employee_profile
     WHERE user_id = ? AND avatar_data IS NOT NULL AND avatar_data != ''
     LIMIT 1`,
  )
    .bind(userId)
    .first<{ ok: number }>();
  return Boolean(row);
}

async function hasGoogleCalendar(userId: string): Promise<boolean> {
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(
      `SELECT 1 AS ok
       FROM google_calendar_connection
       WHERE user_id = ? AND status = 'connected'
       LIMIT 1`,
    )
      .bind(userId)
      .first<{ ok: number }>();
    return Boolean(row);
  } catch {
    return false;
  }
}

async function hasPhoneNumber(userId: string): Promise<boolean> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT phone
     FROM employee_profile
     WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ phone: string | null }>();

  return Boolean(row?.phone?.trim());
}

/** Progress tracks shown on Home and /progress. */
export async function listProgressTracksForUser(userId: string): Promise<ProgressTrack[]> {
  const [avatarDone, calendarDone, phoneDone] = await Promise.all([
    hasAvatar(userId),
    hasGoogleCalendar(userId),
    hasPhoneNumber(userId),
  ]);

  const onboarding = trackFromSteps(
    'onboarding',
    'Onboarding',
    'Get set up on the portal for day-to-day work.',
    [
      {
        id: 'onboarding.phone',
        label: 'Add your phone number',
        done: phoneDone,
        href: '/account',
      },
      {
        id: 'onboarding.avatar',
        label: 'Upload a profile photo',
        done: avatarDone,
        href: '/account',
      },
      {
        id: 'onboarding.calendar',
        label: 'Connect Google Calendar',
        done: calendarDone,
        href: '/settings#google-calendar',
      },
    ],
  );

  const training = trackFromSteps(
    'training',
    'Required training',
    'Role training modules will appear here as they are published.',
    [
      {
        id: 'training.orientation',
        label: 'Practice orientation',
        done: false,
      },
      {
        id: 'training.ehr',
        label: 'EHR / documentation basics',
        done: false,
      },
      {
        id: 'training.clinical',
        label: 'Clinical workflow overview',
        done: false,
      },
    ],
  );

  const compliance = trackFromSteps(
    'compliance',
    'Compliance',
    'Required policy acknowledgments and annual refreshers.',
    [
      {
        id: 'compliance.handbook',
        label: 'Employee handbook acknowledgment',
        done: false,
      },
      {
        id: 'compliance.hipaa',
        label: 'HIPAA / privacy refresher',
        done: false,
      },
      {
        id: 'compliance.safety',
        label: 'Workplace safety overview',
        done: false,
      },
    ],
  );

  return [onboarding, training, compliance];
}

export function overallProgress(tracks: ProgressTrack[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const completed = tracks.reduce((sum, track) => sum + track.completed, 0);
  const total = tracks.reduce((sum, track) => sum + track.total, 0);
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}
