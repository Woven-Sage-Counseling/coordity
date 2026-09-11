import { getEnv } from './env';
import { nowMs, randomToken } from './crypto';
import { DEFAULT_ORG_ID } from './organization';

export const TRAINING_MODULE_KINDS = ['onboarding', 'using_coordity', 'custom'] as const;
export type TrainingModuleKind = (typeof TRAINING_MODULE_KINDS)[number];

export const TRAINING_BLOCK_TYPES = ['video', 'written', 'resource', 'quiz', 'ack'] as const;
export type TrainingBlockType = (typeof TRAINING_BLOCK_TYPES)[number];

export interface TrainingModule {
  id: string;
  orgId: string;
  kind: TrainingModuleKind;
  title: string;
  description: string;
  sortOrder: number;
  visible: boolean;
  archivedAt: number | null;
  roleKeys: string[];
  lessonCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingLesson {
  id: string;
  moduleId: string;
  title: string;
  sortOrder: number;
  required: boolean;
  isAssignment: boolean;
  roleKeys: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TrainingQuizQuestion {
  id: string;
  blockId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  sortOrder: number;
}

export interface TrainingBlock {
  id: string;
  lessonId: string;
  type: TrainingBlockType;
  sortOrder: number;
  youtubeUrl: string | null;
  bodyText: string | null;
  resourceUrl: string | null;
  resourceLabel: string | null;
  fileName: string | null;
  fileMime: string | null;
  hasFile: boolean;
  ackPrompt: string | null;
  passPercent: number | null;
  questions: TrainingQuizQuestion[];
  createdAt: number;
  updatedAt: number;
}

export interface TrainingModuleProgress {
  module: TrainingModule;
  lessons: Array<TrainingLesson & { completed: boolean }>;
  assignments: Array<TrainingLesson & { completed: boolean }>;
  completedLessons: number;
  totalLessons: number;
  completedAssignments: number;
  totalAssignments: number;
  percent: number;
  complete: boolean;
}

function parseKind(value: string): TrainingModuleKind {
  return TRAINING_MODULE_KINDS.includes(value as TrainingModuleKind)
    ? (value as TrainingModuleKind)
    : 'custom';
}

function parseBlockType(value: string): TrainingBlockType {
  return TRAINING_BLOCK_TYPES.includes(value as TrainingBlockType)
    ? (value as TrainingBlockType)
    : 'written';
}

function parseOptions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item));
  } catch {
    return [];
  }
}

export function extractYoutubeId(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts') return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function listRoleKeysForModule(moduleId: string): Promise<string[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT role_key FROM training_module_role WHERE module_id = ? ORDER BY role_key`,
  )
    .bind(moduleId)
    .all<{ role_key: string }>();
  return (rows.results ?? []).map((row) => row.role_key);
}

async function listRoleKeysForLesson(lessonId: string): Promise<string[]> {
  const { DB } = getEnv();
  try {
    const rows = await DB.prepare(
      `SELECT role_key FROM training_lesson_role WHERE lesson_id = ? ORDER BY role_key`,
    )
      .bind(lessonId)
      .all<{ role_key: string }>();
    return (rows.results ?? []).map((row) => row.role_key);
  } catch {
    return [];
  }
}

async function setLessonRoleKeys(lessonId: string, roleKeys: string[]): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(`DELETE FROM training_lesson_role WHERE lesson_id = ?`).bind(lessonId).run();
  for (const key of roleKeys) {
    await DB.prepare(`INSERT INTO training_lesson_role (lesson_id, role_key) VALUES (?, ?)`)
      .bind(lessonId, key)
      .run();
  }
}

/** Roles a lesson/assignment may be restricted to, based on its module. */
export function allowedLessonRolesForModule(
  module: TrainingModule,
  allOrgRoleKeys: string[],
): string[] {
  if (module.roleKeys.length === 0) return allOrgRoleKeys;
  return module.roleKeys.filter((key) => allOrgRoleKeys.includes(key));
}

export function lessonVisibleToRoles(
  lesson: Pick<TrainingLesson, 'roleKeys'>,
  roleKeys: string[],
): boolean {
  if (lesson.roleKeys.length === 0) return true;
  return lesson.roleKeys.some((key) => roleKeys.includes(key));
}

async function countLessons(moduleId: string): Promise<number> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT COUNT(*) AS n FROM training_lesson WHERE module_id = ?`,
  )
    .bind(moduleId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function seedTrainingForOrg(orgId: string): Promise<void> {
  const { DB } = getEnv();
  const existing = await DB.prepare(
    `SELECT id FROM training_module WHERE org_id = ? LIMIT 1`,
  )
    .bind(orgId)
    .first();
  if (existing) return;

  const ts = nowMs();
  const onboardingId = randomToken(16);
  const usingId = randomToken(16);

  await DB.batch([
    DB.prepare(
      `INSERT INTO training_module
         (id, org_id, kind, title, description, sort_order, visible, archived_at, created_at, updated_at)
       VALUES (?, ?, 'onboarding', 'Onboarding', 'Documents, setup, and acknowledgments for new team members.', 0, 1, NULL, ?, ?)`,
    ).bind(onboardingId, orgId, ts, ts),
    DB.prepare(
      `INSERT INTO training_module
         (id, org_id, kind, title, description, sort_order, visible, archived_at, created_at, updated_at)
       VALUES (?, ?, 'using_coordity', 'Using Coordity', 'Learn the employee portal — home, time, directory, and more.', 1, 1, NULL, ?, ?)`,
    ).bind(usingId, orgId, ts, ts),
  ]);

  const usingLessons = [
    {
      title: 'Welcome to your workspace',
      body: 'Coordity is your practice’s employee portal. Use Home for announcements and widgets, WorkHub for day-to-day tools, and Account to keep your profile up to date.',
    },
    {
      title: 'Home, widgets, and shortcuts',
      body: 'Pin the tools you use most. Widgets on Home give a quick view of tasks, time off, timesheets, and progress. Shortcuts jump you to the pages you open often.',
    },
    {
      title: 'Time, schedule, and time off',
      body: 'If your role includes timesheets, clock in from WorkHub or Home. Request time off from the Time off tool. Connect Google Calendar in Settings to see your schedule.',
    },
    {
      title: 'Directory and messages',
      body: 'Find coworkers in Directory and message teammates from Messages. Keep your phone number and photo current so the team can reach you.',
    },
  ];

  const lessonStatements = usingLessons.map((lesson, index) => {
    const lessonId = randomToken(16);
    const blockId = randomToken(16);
    return [
      DB.prepare(
        `INSERT INTO training_lesson
           (id, module_id, title, sort_order, required, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      ).bind(lessonId, usingId, lesson.title, index, ts, ts),
      DB.prepare(
        `INSERT INTO training_block
           (id, lesson_id, type, sort_order, body_text, created_at, updated_at)
         VALUES (?, ?, 'written', 0, ?, ?, ?)`,
      ).bind(blockId, lessonId, lesson.body, ts, ts),
    ];
  });

  await DB.batch(lessonStatements.flat());
}

export async function ensureTrainingSeeded(orgId = DEFAULT_ORG_ID): Promise<void> {
  try {
    await seedTrainingForOrg(orgId);
  } catch (error) {
    console.error('training seed failed', error);
  }
}

export async function backfillTrainingForAllOrgs(): Promise<number> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id FROM organization WHERE slug IS NOT NULL`,
  ).all<{ id: string }>();
  let count = 0;
  for (const row of rows.results ?? []) {
    await seedTrainingForOrg(row.id);
    count += 1;
  }
  return count;
}

export async function listTrainingModules(
  orgId: string,
  options?: { includeHidden?: boolean; includeArchived?: boolean },
): Promise<TrainingModule[]> {
  await ensureTrainingSeeded(orgId);
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, org_id, kind, title, description, sort_order, visible, archived_at, created_at, updated_at
     FROM training_module
     WHERE org_id = ?
       ${options?.includeArchived ? '' : 'AND archived_at IS NULL'}
       ${options?.includeHidden ? '' : 'AND visible = 1'}
     ORDER BY sort_order ASC, created_at ASC`,
  )
    .bind(orgId)
    .all<{
      id: string;
      org_id: string;
      kind: string;
      title: string;
      description: string;
      sort_order: number;
      visible: number;
      archived_at: number | null;
      created_at: number;
      updated_at: number;
    }>();

  const modules: TrainingModule[] = [];
  for (const row of rows.results ?? []) {
    modules.push({
      id: row.id,
      orgId: row.org_id,
      kind: parseKind(row.kind),
      title: row.title,
      description: row.description,
      sortOrder: row.sort_order,
      visible: row.visible === 1,
      archivedAt: row.archived_at,
      roleKeys: await listRoleKeysForModule(row.id),
      lessonCount: await countLessons(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return modules;
}

export function moduleVisibleToRoles(module: TrainingModule, roleKeys: string[]): boolean {
  if (!module.visible || module.archivedAt) return false;
  if (module.roleKeys.length === 0) return true;
  return module.roleKeys.some((key) => roleKeys.includes(key));
}

export async function listModulesForUser(input: {
  orgId: string;
  roleKeys: string[];
}): Promise<TrainingModule[]> {
  const modules = await listTrainingModules(input.orgId, {
    includeHidden: false,
    includeArchived: false,
  });
  return modules.filter((module) => moduleVisibleToRoles(module, input.roleKeys));
}

export async function getTrainingModule(
  moduleId: string,
  orgId: string,
): Promise<TrainingModule | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT id, org_id, kind, title, description, sort_order, visible, archived_at, created_at, updated_at
     FROM training_module WHERE id = ? AND org_id = ?`,
  )
    .bind(moduleId, orgId)
    .first<{
      id: string;
      org_id: string;
      kind: string;
      title: string;
      description: string;
      sort_order: number;
      visible: number;
      archived_at: number | null;
      created_at: number;
      updated_at: number;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    kind: parseKind(row.kind),
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    visible: row.visible === 1,
    archivedAt: row.archived_at,
    roleKeys: await listRoleKeysForModule(row.id),
    lessonCount: await countLessons(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLessons(
  moduleId: string,
  options?: { assignmentsOnly?: boolean; includeAll?: boolean },
): Promise<TrainingLesson[]> {
  const { DB } = getEnv();
  let filter = '';
  if (!options?.includeAll) {
    filter = options?.assignmentsOnly ? 'AND is_assignment = 1' : 'AND is_assignment = 0';
  }
  const rows = await DB.prepare(
    `SELECT id, module_id, title, sort_order, required, is_assignment, created_at, updated_at
     FROM training_lesson
     WHERE module_id = ? ${filter}
     ORDER BY sort_order ASC, created_at ASC`,
  )
    .bind(moduleId)
    .all<{
      id: string;
      module_id: string;
      title: string;
      sort_order: number;
      required: number;
      is_assignment: number;
      created_at: number;
      updated_at: number;
    }>();
  const lessons: TrainingLesson[] = [];
  for (const row of rows.results ?? []) {
    lessons.push({
      id: row.id,
      moduleId: row.module_id,
      title: row.title,
      sortOrder: row.sort_order,
      required: row.required === 1,
      isAssignment: row.is_assignment === 1,
      roleKeys: await listRoleKeysForLesson(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return lessons;
}

export async function listAssignments(moduleId: string): Promise<TrainingLesson[]> {
  return listLessons(moduleId, { assignmentsOnly: true });
}

export async function getLesson(
  lessonId: string,
): Promise<(TrainingLesson & { orgId: string }) | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT l.id, l.module_id, l.title, l.sort_order, l.required, l.is_assignment,
            l.created_at, l.updated_at, m.org_id
     FROM training_lesson l
     JOIN training_module m ON m.id = l.module_id
     WHERE l.id = ?`,
  )
    .bind(lessonId)
    .first<{
      id: string;
      module_id: string;
      title: string;
      sort_order: number;
      required: number;
      is_assignment: number;
      created_at: number;
      updated_at: number;
      org_id: string;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    moduleId: row.module_id,
    title: row.title,
    sortOrder: row.sort_order,
    required: row.required === 1,
    isAssignment: row.is_assignment === 1,
    roleKeys: await listRoleKeysForLesson(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orgId: row.org_id,
  };
}

async function listQuestions(blockId: string): Promise<TrainingQuizQuestion[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, block_id, prompt, options_json, correct_index, sort_order
     FROM training_quiz_question WHERE block_id = ? ORDER BY sort_order ASC`,
  )
    .bind(blockId)
    .all<{
      id: string;
      block_id: string;
      prompt: string;
      options_json: string;
      correct_index: number;
      sort_order: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    blockId: row.block_id,
    prompt: row.prompt,
    options: parseOptions(row.options_json),
    correctIndex: row.correct_index,
    sortOrder: row.sort_order,
  }));
}

export async function listBlocks(lessonId: string): Promise<TrainingBlock[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, lesson_id, type, sort_order, youtube_url, body_text, resource_url, resource_label,
            file_name, file_mime, file_data, ack_prompt, pass_percent, created_at, updated_at
     FROM training_block WHERE lesson_id = ? ORDER BY sort_order ASC, created_at ASC`,
  )
    .bind(lessonId)
    .all<{
      id: string;
      lesson_id: string;
      type: string;
      sort_order: number;
      youtube_url: string | null;
      body_text: string | null;
      resource_url: string | null;
      resource_label: string | null;
      file_name: string | null;
      file_mime: string | null;
      file_data: string | null;
      ack_prompt: string | null;
      pass_percent: number | null;
      created_at: number;
      updated_at: number;
    }>();

  const blocks: TrainingBlock[] = [];
  for (const row of rows.results ?? []) {
    const type = parseBlockType(row.type);
    blocks.push({
      id: row.id,
      lessonId: row.lesson_id,
      type,
      sortOrder: row.sort_order,
      youtubeUrl: row.youtube_url,
      bodyText: row.body_text,
      resourceUrl: row.resource_url,
      resourceLabel: row.resource_label,
      fileName: row.file_name,
      fileMime: row.file_mime,
      hasFile: Boolean(row.file_data),
      ackPrompt: row.ack_prompt,
      passPercent: row.pass_percent,
      questions: type === 'quiz' ? await listQuestions(row.id) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return blocks;
}

export async function listCompletedLessonIds(userId: string, lessonIds: string[]): Promise<Set<string>> {
  if (lessonIds.length === 0) return new Set();
  const { DB } = getEnv();
  const placeholders = lessonIds.map(() => '?').join(', ');
  const rows = await DB.prepare(
    `SELECT lesson_id FROM training_lesson_progress
     WHERE user_id = ? AND lesson_id IN (${placeholders})`,
  )
    .bind(userId, ...lessonIds)
    .all<{ lesson_id: string }>();
  return new Set((rows.results ?? []).map((row) => row.lesson_id));
}

export async function getModuleProgressForUser(input: {
  orgId: string;
  moduleId: string;
  userId: string;
  roleKeys?: string[];
}): Promise<TrainingModuleProgress | null> {
  const module = await getTrainingModule(input.moduleId, input.orgId);
  if (!module) return null;
  const roleKeys = input.roleKeys ?? [];
  const [lessonsRaw, assignmentsRaw] = await Promise.all([
    listLessons(module.id),
    listAssignments(module.id),
  ]);
  const lessons =
    roleKeys.length > 0
      ? lessonsRaw.filter((lesson) => lessonVisibleToRoles(lesson, roleKeys))
      : lessonsRaw;
  const assignments =
    roleKeys.length > 0
      ? assignmentsRaw.filter((item) => lessonVisibleToRoles(item, roleKeys))
      : assignmentsRaw;
  const allItems = [...assignments, ...lessons];
  const completed = await listCompletedLessonIds(
    input.userId,
    allItems.map((item) => item.id),
  );
  const withLessonStatus = lessons.map((lesson) => ({
    ...lesson,
    completed: completed.has(lesson.id),
  }));
  const withAssignmentStatus = assignments.map((assignment) => ({
    ...assignment,
    completed: completed.has(assignment.id),
  }));

  const requiredLessons = withLessonStatus.filter((lesson) => lesson.required);
  const lessonPool = requiredLessons.length ? requiredLessons : withLessonStatus;
  const completedLessons = lessonPool.filter((l) => l.completed).length;
  const totalLessons = lessonPool.length;

  const requiredAssignments = withAssignmentStatus.filter((item) => item.required);
  const assignmentPool = requiredAssignments.length ? requiredAssignments : withAssignmentStatus;
  const completedAssignments = assignmentPool.filter((l) => l.completed).length;
  const totalAssignments = assignmentPool.length;

  const total = totalLessons + totalAssignments;
  const done = completedLessons + completedAssignments;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return {
    module,
    lessons: withLessonStatus,
    assignments: withAssignmentStatus,
    completedLessons,
    totalLessons,
    completedAssignments,
    totalAssignments,
    percent,
    complete: total > 0 && done >= total,
  };
}

export async function listModuleProgressForUser(input: {
  orgId: string;
  userId: string;
  roleKeys: string[];
}): Promise<TrainingModuleProgress[]> {
  const modules = await listModulesForUser({ orgId: input.orgId, roleKeys: input.roleKeys });
  const out: TrainingModuleProgress[] = [];
  for (const module of modules) {
    const progress = await getModuleProgressForUser({
      orgId: input.orgId,
      moduleId: module.id,
      userId: input.userId,
      roleKeys: input.roleKeys,
    });
    if (progress) out.push(progress);
  }
  return out;
}

export async function completeLesson(input: {
  userId: string;
  lessonId: string;
  ackName?: string | null;
}): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO training_lesson_progress (user_id, lesson_id, completed_at, ack_name)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET
       completed_at = excluded.completed_at,
       ack_name = COALESCE(excluded.ack_name, training_lesson_progress.ack_name)`,
  )
    .bind(input.userId, input.lessonId, nowMs(), input.ackName?.trim() || null)
    .run();
}

export async function submitQuizAttempt(input: {
  userId: string;
  blockId: string;
  answers: number[];
}): Promise<{ score: number; passed: boolean; attemptId: string }> {
  const questions = await listQuestions(input.blockId);
  const { DB } = getEnv();
  const block = await DB.prepare(
    `SELECT pass_percent FROM training_block WHERE id = ? AND type = 'quiz'`,
  )
    .bind(input.blockId)
    .first<{ pass_percent: number | null }>();
  if (!block) throw new Error('Quiz not found.');

  let correct = 0;
  questions.forEach((question, index) => {
    if (input.answers[index] === question.correctIndex) correct += 1;
  });
  const score = questions.length === 0 ? 100 : Math.round((correct / questions.length) * 100);
  const passPercent = block.pass_percent ?? 80;
  const passed = score >= passPercent;
  const attemptId = randomToken(16);
  await DB.prepare(
    `INSERT INTO training_quiz_attempt
       (id, user_id, block_id, score, passed, answers_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(attemptId, input.userId, input.blockId, score, passed ? 1 : 0, JSON.stringify(input.answers), nowMs())
    .run();

  return { score, passed, attemptId };
}

export async function latestQuizPass(userId: string, blockId: string): Promise<boolean> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT passed FROM training_quiz_attempt
     WHERE user_id = ? AND block_id = ?
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(userId, blockId)
    .first<{ passed: number }>();
  return row?.passed === 1;
}

export async function updateModule(input: {
  orgId: string;
  moduleId: string;
  title?: string;
  description?: string;
  visible?: boolean;
  roleKeys?: string[];
}): Promise<void> {
  const module = await getTrainingModule(input.moduleId, input.orgId);
  if (!module) throw new Error('Module not found.');
  const { DB } = getEnv();
  const ts = nowMs();
  await DB.prepare(
    `UPDATE training_module
     SET title = ?, description = ?, visible = ?, updated_at = ?
     WHERE id = ? AND org_id = ?`,
  )
    .bind(
      input.title?.trim() || module.title,
      input.description?.trim() ?? module.description,
      input.visible == null ? (module.visible ? 1 : 0) : input.visible ? 1 : 0,
      ts,
      input.moduleId,
      input.orgId,
    )
    .run();

  if (input.roleKeys) {
    await DB.prepare(`DELETE FROM training_module_role WHERE module_id = ?`)
      .bind(input.moduleId)
      .run();
    for (const key of input.roleKeys) {
      await DB.prepare(
        `INSERT INTO training_module_role (module_id, role_key) VALUES (?, ?)`,
      )
        .bind(input.moduleId, key)
        .run();
    }
    // Drop lesson/assignment roles that are no longer allowed on the module.
    if (input.roleKeys.length > 0) {
      const placeholders = input.roleKeys.map(() => '?').join(', ');
      await DB.prepare(
        `DELETE FROM training_lesson_role
         WHERE lesson_id IN (SELECT id FROM training_lesson WHERE module_id = ?)
           AND role_key NOT IN (${placeholders})`,
      )
        .bind(input.moduleId, ...input.roleKeys)
        .run();
    }
  }
}

export async function createCustomModule(input: {
  orgId: string;
  title: string;
  description?: string;
  roleKeys: string[];
}): Promise<TrainingModule> {
  const { DB } = getEnv();
  const ts = nowMs();
  const id = randomToken(16);
  const maxSort = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), 1) AS n FROM training_module WHERE org_id = ?`,
  )
    .bind(input.orgId)
    .first<{ n: number }>();
  const sortOrder = Number(maxSort?.n ?? 1) + 1;
  await DB.prepare(
    `INSERT INTO training_module
       (id, org_id, kind, title, description, sort_order, visible, archived_at, created_at, updated_at)
     VALUES (?, ?, 'custom', ?, ?, ?, 1, NULL, ?, ?)`,
  )
    .bind(
      id,
      input.orgId,
      input.title.trim(),
      (input.description ?? '').trim(),
      sortOrder,
      ts,
      ts,
    )
    .run();
  for (const key of input.roleKeys) {
    await DB.prepare(`INSERT INTO training_module_role (module_id, role_key) VALUES (?, ?)`)
      .bind(id, key)
      .run();
  }
  const created = await getTrainingModule(id, input.orgId);
  if (!created) throw new Error('Could not create module.');
  return created;
}

export async function archiveModule(orgId: string, moduleId: string): Promise<void> {
  const module = await getTrainingModule(moduleId, orgId);
  if (!module) throw new Error('Module not found.');
  if (module.kind !== 'custom') throw new Error('Only custom modules can be archived.');
  const { DB } = getEnv();
  await DB.prepare(
    `UPDATE training_module SET archived_at = ?, updated_at = ? WHERE id = ? AND org_id = ?`,
  )
    .bind(nowMs(), nowMs(), moduleId, orgId)
    .run();
}

export async function createLesson(input: {
  orgId: string;
  moduleId: string;
  title: string;
  isAssignment?: boolean;
}): Promise<TrainingLesson> {
  const module = await getTrainingModule(input.moduleId, input.orgId);
  if (!module) throw new Error('Module not found.');
  const { DB } = getEnv();
  const ts = nowMs();
  const id = randomToken(16);
  const isAssignment = Boolean(input.isAssignment);
  const maxSort = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS n
     FROM training_lesson
     WHERE module_id = ? AND is_assignment = ?`,
  )
    .bind(input.moduleId, isAssignment ? 1 : 0)
    .first<{ n: number }>();
  await DB.prepare(
    `INSERT INTO training_lesson
       (id, module_id, title, sort_order, required, is_assignment, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
  )
    .bind(
      id,
      input.moduleId,
      input.title.trim(),
      Number(maxSort?.n ?? -1) + 1,
      isAssignment ? 1 : 0,
      ts,
      ts,
    )
    .run();
  await DB.prepare(`UPDATE training_module SET updated_at = ? WHERE id = ?`)
    .bind(ts, input.moduleId)
    .run();
  const items = isAssignment
    ? await listAssignments(input.moduleId)
    : await listLessons(input.moduleId);
  const lesson = items.find((item) => item.id === id);
  if (!lesson) throw new Error(isAssignment ? 'Could not create assignment.' : 'Could not create lesson.');
  return lesson;
}

export async function updateLesson(input: {
  orgId: string;
  lessonId: string;
  title?: string;
  required?: boolean;
  roleKeys?: string[];
  /** Roles offered in the admin UI; used to detect “all checked” → inherit. */
  availableRoleKeys?: string[];
}): Promise<void> {
  const lesson = await getLesson(input.lessonId);
  if (!lesson || lesson.orgId !== input.orgId) throw new Error('Lesson not found.');
  const module = await getTrainingModule(lesson.moduleId, input.orgId);
  if (!module) throw new Error('Module not found.');
  const { DB } = getEnv();
  await DB.prepare(
    `UPDATE training_lesson SET title = ?, required = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      input.title?.trim() || lesson.title,
      input.required == null ? (lesson.required ? 1 : 0) : input.required ? 1 : 0,
      nowMs(),
      input.lessonId,
    )
    .run();

  if (input.roleKeys) {
    const available =
      input.availableRoleKeys && input.availableRoleKeys.length > 0
        ? input.availableRoleKeys
        : module.roleKeys;
    if (available.length > 0) {
      const invalid = input.roleKeys.filter((key) => !available.includes(key));
      if (invalid.length > 0) {
        throw new Error('Lesson roles must be a subset of the module’s roles.');
      }
    }
    const selected =
      available.length > 0
        ? input.roleKeys.filter((key) => available.includes(key))
        : input.roleKeys;
    const coversAll = available.length > 0 && selected.length === available.length;
    const storeKeys = selected.length === 0 || coversAll ? [] : selected;
    await setLessonRoleKeys(input.lessonId, storeKeys);
  }
}

export async function deleteLesson(orgId: string, lessonId: string): Promise<void> {
  const lesson = await getLesson(lessonId);
  if (!lesson || lesson.orgId !== orgId) throw new Error('Lesson not found.');
  const { DB } = getEnv();
  await DB.prepare(`DELETE FROM training_lesson WHERE id = ?`).bind(lessonId).run();
}

export async function createBlock(input: {
  orgId: string;
  lessonId: string;
  type: TrainingBlockType;
  youtubeUrl?: string | null;
  bodyText?: string | null;
  resourceUrl?: string | null;
  resourceLabel?: string | null;
  ackPrompt?: string | null;
  passPercent?: number | null;
}): Promise<TrainingBlock> {
  const lesson = await getLesson(input.lessonId);
  if (!lesson || lesson.orgId !== input.orgId) throw new Error('Lesson not found.');
  if (input.type === 'video' && input.youtubeUrl && !extractYoutubeId(input.youtubeUrl)) {
    throw new Error('Enter a valid YouTube link.');
  }
  const { DB } = getEnv();
  const ts = nowMs();
  const id = randomToken(16);
  const maxSort = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS n FROM training_block WHERE lesson_id = ?`,
  )
    .bind(input.lessonId)
    .first<{ n: number }>();
  await DB.prepare(
    `INSERT INTO training_block
       (id, lesson_id, type, sort_order, youtube_url, body_text, resource_url, resource_label,
        ack_prompt, pass_percent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.lessonId,
      input.type,
      Number(maxSort?.n ?? -1) + 1,
      input.youtubeUrl?.trim() || null,
      input.bodyText?.trim() || null,
      input.resourceUrl?.trim() || null,
      input.resourceLabel?.trim() || null,
      input.ackPrompt?.trim() || null,
      input.type === 'quiz' ? (input.passPercent ?? 80) : null,
      ts,
      ts,
    )
    .run();
  const blocks = await listBlocks(input.lessonId);
  const block = blocks.find((item) => item.id === id);
  if (!block) throw new Error('Could not create block.');
  return block;
}

export async function updateBlock(input: {
  orgId: string;
  blockId: string;
  youtubeUrl?: string | null;
  bodyText?: string | null;
  resourceUrl?: string | null;
  resourceLabel?: string | null;
  ackPrompt?: string | null;
  passPercent?: number | null;
}): Promise<void> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT b.id, b.type, b.youtube_url, b.body_text, b.resource_url, b.resource_label,
            b.ack_prompt, b.pass_percent, m.org_id
     FROM training_block b
     JOIN training_lesson l ON l.id = b.lesson_id
     JOIN training_module m ON m.id = l.module_id
     WHERE b.id = ?`,
  )
    .bind(input.blockId)
    .first<{
      id: string;
      type: string;
      youtube_url: string | null;
      body_text: string | null;
      resource_url: string | null;
      resource_label: string | null;
      ack_prompt: string | null;
      pass_percent: number | null;
      org_id: string;
    }>();
  if (!row || row.org_id !== input.orgId) throw new Error('Block not found.');
  if (input.youtubeUrl != null && input.youtubeUrl.trim() && !extractYoutubeId(input.youtubeUrl)) {
    throw new Error('Enter a valid YouTube link.');
  }
  const youtubeUrl =
    input.youtubeUrl === undefined ? row.youtube_url : (input.youtubeUrl ?? '').trim() || null;
  const bodyText = input.bodyText === undefined ? row.body_text : input.bodyText;
  const resourceUrl =
    input.resourceUrl === undefined
      ? row.resource_url
      : (input.resourceUrl ?? '').trim() || null;
  const resourceLabel =
    input.resourceLabel === undefined
      ? row.resource_label
      : (input.resourceLabel ?? '').trim() || null;
  const ackPrompt =
    input.ackPrompt === undefined ? row.ack_prompt : (input.ackPrompt ?? '').trim() || null;
  const passPercent =
    input.passPercent === undefined ? row.pass_percent : input.passPercent;
  await DB.prepare(
    `UPDATE training_block
     SET youtube_url = ?,
         body_text = ?,
         resource_url = ?,
         resource_label = ?,
         ack_prompt = ?,
         pass_percent = ?,
         updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      youtubeUrl,
      bodyText,
      resourceUrl,
      resourceLabel,
      ackPrompt,
      passPercent,
      nowMs(),
      input.blockId,
    )
    .run();
}

export async function deleteBlock(orgId: string, blockId: string): Promise<void> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT b.id, m.org_id
     FROM training_block b
     JOIN training_lesson l ON l.id = b.lesson_id
     JOIN training_module m ON m.id = l.module_id
     WHERE b.id = ?`,
  )
    .bind(blockId)
    .first<{ id: string; org_id: string }>();
  if (!row || row.org_id !== orgId) throw new Error('Block not found.');
  await DB.prepare(`DELETE FROM training_block WHERE id = ?`).bind(blockId).run();
}

export async function addQuizQuestion(input: {
  orgId: string;
  blockId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}): Promise<void> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT b.id, b.type, m.org_id
     FROM training_block b
     JOIN training_lesson l ON l.id = b.lesson_id
     JOIN training_module m ON m.id = l.module_id
     WHERE b.id = ?`,
  )
    .bind(input.blockId)
    .first<{ id: string; type: string; org_id: string }>();
  if (!row || row.org_id !== input.orgId || row.type !== 'quiz') {
    throw new Error('Quiz not found.');
  }
  if (input.options.length < 2) throw new Error('Add at least two answer options.');
  if (input.correctIndex < 0 || input.correctIndex >= input.options.length) {
    throw new Error('Pick a valid correct answer.');
  }
  const maxSort = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS n FROM training_quiz_question WHERE block_id = ?`,
  )
    .bind(input.blockId)
    .first<{ n: number }>();
  await DB.prepare(
    `INSERT INTO training_quiz_question (id, block_id, prompt, options_json, correct_index, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      randomToken(16),
      input.blockId,
      input.prompt.trim(),
      JSON.stringify(input.options.map((o) => o.trim()).filter(Boolean)),
      input.correctIndex,
      Number(maxSort?.n ?? -1) + 1,
    )
    .run();
}

export async function listTrainingRoster(orgId: string): Promise<
  Array<{
    userId: string;
    name: string;
    email: string;
    roleKeys: string[];
    modules: Array<{ moduleId: string; title: string; percent: number; complete: boolean }>;
  }>
> {
  const { DB } = getEnv();
  const people = await DB.prepare(
    `SELECT u.id, u.name, u.email
     FROM user u
     JOIN organization_member om ON om.user_id = u.id
     JOIN employee_profile p ON p.user_id = u.id
     WHERE om.org_id = ? AND p.status = 'active'
     ORDER BY u.name COLLATE NOCASE`,
  )
    .bind(orgId)
    .all<{ id: string; name: string; email: string }>();

  const allModules = await listTrainingModules(orgId, { includeHidden: true });
  const roster = [];
  for (const person of people.results ?? []) {
    const roles = await DB.prepare(
      `SELECT r.key FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = ?`,
    )
      .bind(person.id)
      .all<{ key: string }>();
    const roleKeys = (roles.results ?? []).map((r) => r.key);
    const visibleModules = allModules.filter(
      (module) => module.visible && moduleVisibleToRoles(module, roleKeys),
    );
    const modules = [];
    for (const module of visibleModules) {
      const progress = await getModuleProgressForUser({
        orgId,
        moduleId: module.id,
        userId: person.id,
        roleKeys,
      });
      if (!progress) continue;
      modules.push({
        moduleId: module.id,
        title: module.title,
        percent: progress.percent,
        complete: progress.complete,
      });
    }
    roster.push({
      userId: person.id,
      name: person.name,
      email: person.email,
      roleKeys,
      modules,
    });
  }
  return roster;
}

export async function listQuizScoresForUser(userId: string, orgId: string): Promise<
  Array<{ blockId: string; lessonTitle: string; moduleTitle: string; score: number; passed: boolean; createdAt: number }>
> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT a.block_id, a.score, a.passed, a.created_at, l.title AS lesson_title, m.title AS module_title
     FROM training_quiz_attempt a
     JOIN training_block b ON b.id = a.block_id
     JOIN training_lesson l ON l.id = b.lesson_id
     JOIN training_module m ON m.id = l.module_id
     WHERE a.user_id = ? AND m.org_id = ?
     ORDER BY a.created_at DESC
     LIMIT 100`,
  )
    .bind(userId, orgId)
    .all<{
      block_id: string;
      score: number;
      passed: number;
      created_at: number;
      lesson_title: string;
      module_title: string;
    }>();
  return (rows.results ?? []).map((row) => ({
    blockId: row.block_id,
    lessonTitle: row.lesson_title,
    moduleTitle: row.module_title,
    score: row.score,
    passed: row.passed === 1,
    createdAt: row.created_at,
  }));
}
