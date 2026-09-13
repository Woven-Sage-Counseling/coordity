import { getEnv } from './env';
import { nowMs, randomToken } from './crypto';
import { formatPhoneNumber, updateDirectoryProfile, updateEmployeeJobTitle } from './employees';
import { DEFAULT_ORG_ID } from './organization';

export const TRAINING_MODULE_KINDS = ['onboarding', 'using_coordity', 'custom'] as const;
export type TrainingModuleKind = (typeof TRAINING_MODULE_KINDS)[number];

export const TRAINING_BLOCK_TYPES = [
  'video',
  'written',
  'resource',
  'quiz',
  'ack',
  'docusign',
  'contact',
] as const;
export type TrainingBlockType = (typeof TRAINING_BLOCK_TYPES)[number];

export interface ContactDetailsAnswers {
  fullName: string;
  phone: string;
  workEmail: string;
  jobTitle: string;
}

export const CONTACT_FIELD_KEYS = ['fullName', 'phone', 'workEmail', 'jobTitle'] as const;
export type ContactFieldKey = (typeof CONTACT_FIELD_KEYS)[number];

export const CONTACT_FIELD_OPTIONS: Array<{
  key: ContactFieldKey;
  label: string;
  shortLabel: string;
  inputType: 'text' | 'tel' | 'email';
  required: boolean;
}> = [
  { key: 'fullName', label: 'Name', shortLabel: 'Name', inputType: 'text', required: true },
  { key: 'phone', label: 'Phone number', shortLabel: 'Phone', inputType: 'tel', required: true },
  { key: 'workEmail', label: 'Email', shortLabel: 'Email', inputType: 'email', required: true },
  { key: 'jobTitle', label: 'Job title', shortLabel: 'Job title', inputType: 'text', required: false },
];

export function parseContactFields(raw: string | null | undefined): ContactFieldKey[] {
  if (!raw?.trim()) return ['fullName'];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ['fullName'];
    const keys = parsed
      .map((item) => String(item))
      .filter((item): item is ContactFieldKey =>
        CONTACT_FIELD_KEYS.includes(item as ContactFieldKey),
      );
    return keys.length > 0 ? keys : ['fullName'];
  } catch {
    return ['fullName'];
  }
}

export function serializeContactFields(fields: ContactFieldKey[]): string {
  const unique = CONTACT_FIELD_KEYS.filter((key) => fields.includes(key));
  return JSON.stringify(unique.length > 0 ? unique : ['fullName']);
}

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
  required: boolean;
  youtubeUrl: string | null;
  bodyText: string | null;
  resourceUrl: string | null;
  resourceLabel: string | null;
  fileName: string | null;
  fileMime: string | null;
  hasFile: boolean;
  ackPrompt: string | null;
  passPercent: number | null;
  docusignTemplateId: string | null;
  docusignTemplateName: string | null;
  /** Selected short-answer fields for contact blocks. */
  contactFields: ContactFieldKey[];
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

export function defaultBlockRequired(type: TrainingBlockType): boolean {
  return type === 'quiz' || type === 'ack' || type === 'docusign' || type === 'contact';
}

/** Written text is always informational — never required and never review-gated. */
export function canToggleBlockRequired(type: TrainingBlockType): boolean {
  return type !== 'written';
}

/** Content types that can be marked required (learner confirms review). */
export function isContentBlockType(type: TrainingBlockType): boolean {
  return type === 'video' || type === 'resource';
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
    `SELECT id, lesson_id, type, sort_order, required, youtube_url, body_text, resource_url, resource_label,
            file_name, file_mime, file_data, ack_prompt, pass_percent,
            docusign_template_id, docusign_template_name, created_at, updated_at
     FROM training_block WHERE lesson_id = ? ORDER BY sort_order ASC, created_at ASC`,
  )
    .bind(lessonId)
    .all<{
      id: string;
      lesson_id: string;
      type: string;
      sort_order: number;
      required: number | null;
      youtube_url: string | null;
      body_text: string | null;
      resource_url: string | null;
      resource_label: string | null;
      file_name: string | null;
      file_mime: string | null;
      file_data: string | null;
      ack_prompt: string | null;
      pass_percent: number | null;
      docusign_template_id: string | null;
      docusign_template_name: string | null;
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
      required:
        type === 'written'
          ? false
          : row.required == null
            ? defaultBlockRequired(type)
            : row.required === 1,
      youtubeUrl: row.youtube_url,
      bodyText: row.body_text,
      resourceUrl: row.resource_url,
      resourceLabel: row.resource_label,
      fileName: row.file_name,
      fileMime: row.file_mime,
      hasFile: Boolean(row.file_data),
      ackPrompt: row.ack_prompt,
      passPercent: row.pass_percent,
      docusignTemplateId: row.docusign_template_id,
      docusignTemplateName: row.docusign_template_name,
      contactFields: type === 'contact' ? parseContactFields(row.resource_label) : [],
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

export type ModuleTemplateId = 'custom' | 'onboarding' | 'using_coordity' | 'compliance';

export interface ModuleTemplateItem {
  title: string;
  isAssignment: boolean;
  /** Optional written starter content for lessons. */
  body?: string;
  /** Optional acknowledgment prompt for assignments. */
  ackPrompt?: string;
}

export interface ModuleTemplate {
  id: ModuleTemplateId;
  label: string;
  blurb: string;
  defaultTitle: string;
  defaultDescription: string;
  items: ModuleTemplateItem[];
}

/** Blueprints for “New module”. All create custom modules (editable copies). */
export const MODULE_TEMPLATES: ModuleTemplate[] = [
  {
    id: 'onboarding',
    label: 'New hire onboarding',
    blurb: 'Handbook, setup, and first-week acknowledgments.',
    defaultTitle: 'Onboarding',
    defaultDescription: 'Documents, setup, and acknowledgments for new team members.',
    items: [
      {
        title: 'Acknowledge employee handbook',
        isAssignment: true,
        ackPrompt: 'I have read and understand the employee handbook.',
      },
      {
        title: 'Complete account setup',
        isAssignment: true,
        ackPrompt: 'I have added my phone number and profile photo in Account.',
      },
      {
        title: 'Welcome to the practice',
        isAssignment: false,
        body: 'Welcome to the team. This module covers what to do in your first days — documents to review, account setup, and who to ask for help.',
      },
    ],
  },
  {
    id: 'using_coordity',
    label: 'Using Coordity',
    blurb: 'How to use Home, WorkHub, time, and directory.',
    defaultTitle: 'Using Coordity',
    defaultDescription: 'Learn the employee portal — home, time, directory, and more.',
    items: [
      {
        title: 'Welcome to your workspace',
        isAssignment: false,
        body: 'Coordity is your practice’s employee portal. Use Home for announcements and widgets, WorkHub for day-to-day tools, and Account to keep your profile up to date.',
      },
      {
        title: 'Home, widgets, and shortcuts',
        isAssignment: false,
        body: 'Pin the tools you use most. Widgets on Home give a quick view of tasks, time off, timesheets, and progress. Shortcuts jump you to the pages you open often.',
      },
      {
        title: 'Time, schedule, and time off',
        isAssignment: false,
        body: 'If your role includes timesheets, clock in from WorkHub or Home. Request time off from the Time off tool. Connect Google Calendar in Settings to see your schedule.',
      },
      {
        title: 'Directory and messages',
        isAssignment: false,
        body: 'Find coworkers in Directory and message teammates from Messages. Keep your phone number and photo current so the team can reach you.',
      },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance & policies',
    blurb: 'Policy acknowledgments and required reading.',
    defaultTitle: 'Compliance & policies',
    defaultDescription: 'Required policies and compliance acknowledgments for your role.',
    items: [
      {
        title: 'Acknowledge privacy policy',
        isAssignment: true,
        ackPrompt: 'I have read and agree to follow the privacy policy.',
      },
      {
        title: 'Acknowledge safety procedures',
        isAssignment: true,
        ackPrompt: 'I have reviewed the workplace safety procedures.',
      },
      {
        title: 'Compliance overview',
        isAssignment: false,
        body: 'This module covers required policies for your role. Complete each acknowledgment and review the overview lesson.',
      },
    ],
  },
  {
    id: 'custom',
    label: 'Custom',
    blurb: 'Start blank and build your own module.',
    defaultTitle: '',
    defaultDescription: '',
    items: [],
  },
];

export function getModuleTemplate(templateId: string): ModuleTemplate | null {
  return MODULE_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export async function createModuleFromTemplate(input: {
  orgId: string;
  templateId: string;
  title?: string;
  description?: string;
  roleKeys: string[];
}): Promise<TrainingModule> {
  const template = getModuleTemplate(input.templateId) ?? getModuleTemplate('custom');
  if (!template) throw new Error('Unknown module template.');

  const title = (input.title ?? '').trim() || template.defaultTitle;
  if (!title) throw new Error('Module title is required.');
  if (input.roleKeys.length === 0) throw new Error('Assign at least one role.');

  const description = (input.description ?? '').trim() || template.defaultDescription;
  const created = await createCustomModule({
    orgId: input.orgId,
    title,
    description,
    roleKeys: input.roleKeys,
  });

  for (const item of template.items) {
    const lesson = await createLesson({
      orgId: input.orgId,
      moduleId: created.id,
      title: item.title,
      isAssignment: item.isAssignment,
    });
    if (item.body) {
      await createBlock({
        orgId: input.orgId,
        lessonId: lesson.id,
        type: 'written',
        bodyText: item.body,
      });
    }
    if (item.ackPrompt) {
      await createBlock({
        orgId: input.orgId,
        lessonId: lesson.id,
        type: 'ack',
        ackPrompt: item.ackPrompt,
      });
    }
  }

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
  required?: boolean;
  youtubeUrl?: string | null;
  bodyText?: string | null;
  resourceUrl?: string | null;
  resourceLabel?: string | null;
  ackPrompt?: string | null;
  passPercent?: number | null;
  docusignTemplateId?: string | null;
  docusignTemplateName?: string | null;
  contactFields?: ContactFieldKey[] | null;
}): Promise<TrainingBlock> {
  const lesson = await getLesson(input.lessonId);
  if (!lesson || lesson.orgId !== input.orgId) throw new Error('Lesson not found.');
  if (input.type === 'video' && input.youtubeUrl && !extractYoutubeId(input.youtubeUrl)) {
    throw new Error('Enter a valid YouTube link.');
  }
  if (input.type === 'contact' && input.contactFields && input.contactFields.length === 0) {
    throw new Error('Select at least one contact field.');
  }
  const { DB } = getEnv();
  const ts = nowMs();
  const id = randomToken(16);
  const maxSort = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS n FROM training_block WHERE lesson_id = ?`,
  )
    .bind(input.lessonId)
    .first<{ n: number }>();
  const contactFieldsJson =
    input.type === 'contact'
      ? serializeContactFields(input.contactFields ?? ['fullName', 'phone', 'workEmail'])
      : null;
  const required = !canToggleBlockRequired(input.type)
    ? false
    : input.required == null
      ? defaultBlockRequired(input.type)
      : Boolean(input.required);
  await DB.prepare(
    `INSERT INTO training_block
       (id, lesson_id, type, sort_order, required, youtube_url, body_text, resource_url, resource_label,
        ack_prompt, pass_percent, docusign_template_id, docusign_template_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.lessonId,
      input.type,
      Number(maxSort?.n ?? -1) + 1,
      required ? 1 : 0,
      input.youtubeUrl?.trim() || null,
      input.bodyText?.trim() || null,
      input.resourceUrl?.trim() || null,
      input.type === 'contact' ? contactFieldsJson : input.resourceLabel?.trim() || null,
      input.ackPrompt?.trim() || null,
      input.type === 'quiz' ? (input.passPercent ?? 80) : null,
      input.type === 'docusign' ? input.docusignTemplateId?.trim() || null : null,
      input.type === 'docusign' ? input.docusignTemplateName?.trim() || null : null,
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
  required?: boolean;
  youtubeUrl?: string | null;
  bodyText?: string | null;
  resourceUrl?: string | null;
  resourceLabel?: string | null;
  ackPrompt?: string | null;
  passPercent?: number | null;
  docusignTemplateId?: string | null;
  docusignTemplateName?: string | null;
  contactFields?: ContactFieldKey[] | null;
}): Promise<void> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT b.id, b.type, b.required, b.youtube_url, b.body_text, b.resource_url, b.resource_label,
            b.ack_prompt, b.pass_percent, b.docusign_template_id, b.docusign_template_name, m.org_id
     FROM training_block b
     JOIN training_lesson l ON l.id = b.lesson_id
     JOIN training_module m ON m.id = l.module_id
     WHERE b.id = ?`,
  )
    .bind(input.blockId)
    .first<{
      id: string;
      type: string;
      required: number | null;
      youtube_url: string | null;
      body_text: string | null;
      resource_url: string | null;
      resource_label: string | null;
      ack_prompt: string | null;
      pass_percent: number | null;
      docusign_template_id: string | null;
      docusign_template_name: string | null;
      org_id: string;
    }>();
  if (!row || row.org_id !== input.orgId) throw new Error('Block not found.');
  if (input.youtubeUrl != null && input.youtubeUrl.trim() && !extractYoutubeId(input.youtubeUrl)) {
    throw new Error('Enter a valid YouTube link.');
  }
  const blockType = parseBlockType(row.type);
  const required = !canToggleBlockRequired(blockType)
    ? false
    : input.required === undefined
      ? row.required == null
        ? defaultBlockRequired(blockType)
        : row.required === 1
      : Boolean(input.required);
  const youtubeUrl =
    input.youtubeUrl === undefined ? row.youtube_url : (input.youtubeUrl ?? '').trim() || null;
  const bodyText = input.bodyText === undefined ? row.body_text : input.bodyText;
  const resourceUrl =
    input.resourceUrl === undefined
      ? row.resource_url
      : (input.resourceUrl ?? '').trim() || null;
  let resourceLabel =
    input.resourceLabel === undefined
      ? row.resource_label
      : (input.resourceLabel ?? '').trim() || null;
  if (row.type === 'contact' && input.contactFields !== undefined) {
    if (!input.contactFields || input.contactFields.length === 0) {
      throw new Error('Select at least one contact field.');
    }
    resourceLabel = serializeContactFields(input.contactFields);
  }
  const ackPrompt =
    input.ackPrompt === undefined ? row.ack_prompt : (input.ackPrompt ?? '').trim() || null;
  const passPercent =
    input.passPercent === undefined ? row.pass_percent : input.passPercent;
  const docusignTemplateId =
    input.docusignTemplateId === undefined
      ? row.docusign_template_id
      : (input.docusignTemplateId ?? '').trim() || null;
  const docusignTemplateName =
    input.docusignTemplateName === undefined
      ? row.docusign_template_name
      : (input.docusignTemplateName ?? '').trim() || null;
  if (row.type === 'docusign' && !docusignTemplateId) {
    throw new Error('Choose a DocuSign template.');
  }
  await DB.prepare(
    `UPDATE training_block
     SET required = ?,
         youtube_url = ?,
         body_text = ?,
         resource_url = ?,
         resource_label = ?,
         ack_prompt = ?,
         pass_percent = ?,
         docusign_template_id = ?,
         docusign_template_name = ?,
         updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      required ? 1 : 0,
      youtubeUrl,
      bodyText,
      resourceUrl,
      resourceLabel,
      ackPrompt,
      passPercent,
      docusignTemplateId,
      docusignTemplateName,
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

export async function moveBlock(input: {
  orgId: string;
  blockId: string;
  direction: 'up' | 'down';
}): Promise<{ lessonId: string }> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT b.id, b.lesson_id, m.org_id
     FROM training_block b
     JOIN training_lesson l ON l.id = b.lesson_id
     JOIN training_module m ON m.id = l.module_id
     WHERE b.id = ?`,
  )
    .bind(input.blockId)
    .first<{ id: string; lesson_id: string; org_id: string }>();
  if (!row || row.org_id !== input.orgId) throw new Error('Block not found.');

  const neighbors = await DB.prepare(
    `SELECT id FROM training_block WHERE lesson_id = ? ORDER BY sort_order ASC, created_at ASC`,
  )
    .bind(row.lesson_id)
    .all<{ id: string }>();
  const ordered = (neighbors.results ?? []).map((block) => block.id);
  const index = ordered.indexOf(row.id);
  if (index < 0) throw new Error('Block not found.');
  const swapIndex = input.direction === 'up' ? index - 1 : index + 1;
  if (swapIndex >= 0 && swapIndex < ordered.length) {
    const current = ordered[index]!;
    ordered[index] = ordered[swapIndex]!;
    ordered[swapIndex] = current;
  }

  const ts = nowMs();
  for (let position = 0; position < ordered.length; position += 1) {
    await DB.prepare(`UPDATE training_block SET sort_order = ?, updated_at = ? WHERE id = ?`)
      .bind(position, ts, ordered[position]!)
      .run();
  }

  return { lessonId: row.lesson_id };
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

function parseContactAnswers(raw: string | null | undefined): ContactDetailsAnswers | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ContactDetailsAnswers>;
    return {
      fullName: String(parsed.fullName ?? '').trim(),
      phone: String(parsed.phone ?? '').trim(),
      workEmail: String(parsed.workEmail ?? '').trim(),
      jobTitle: String(parsed.jobTitle ?? '').trim(),
    };
  } catch {
    return null;
  }
}

export async function getBlockResponse(
  userId: string,
  blockId: string,
): Promise<ContactDetailsAnswers | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT answers_json FROM training_block_response WHERE user_id = ? AND block_id = ?`,
  )
    .bind(userId, blockId)
    .first<{ answers_json: string }>();
  return parseContactAnswers(row?.answers_json);
}

export async function hasBlockResponse(userId: string, blockId: string): Promise<boolean> {
  const { DB } = getEnv();
  const block = await DB.prepare(
    `SELECT type, resource_label FROM training_block WHERE id = ?`,
  )
    .bind(blockId)
    .first<{ type: string; resource_label: string | null }>();
  if (!block || block.type !== 'contact') return false;
  const fields = parseContactFields(block.resource_label);
  const answers = await getBlockResponse(userId, blockId);
  if (!answers) return false;
  return fields.every((key) => {
    const option = CONTACT_FIELD_OPTIONS.find((item) => item.key === key);
    if (!option?.required) return true;
    const value = answers[key]?.trim() ?? '';
    if (key === 'fullName') return value.length >= 2;
    if (key === 'workEmail') return value.includes('@');
    if (key === 'phone') return value.length > 0;
    return value.length > 0;
  });
}

export async function hasContentReview(userId: string, blockId: string): Promise<boolean> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT answers_json FROM training_block_response WHERE user_id = ? AND block_id = ?`,
  )
    .bind(userId, blockId)
    .first<{ answers_json: string }>();
  if (!row?.answers_json) return false;
  try {
    const parsed = JSON.parse(row.answers_json) as { reviewed?: boolean };
    return parsed.reviewed === true;
  } catch {
    return false;
  }
}

export async function saveContentReview(input: {
  userId: string;
  blockId: string;
  orgId: string;
}): Promise<void> {
  const { DB } = getEnv();
  const block = await DB.prepare(
    `SELECT b.id, b.type, m.org_id
     FROM training_block b
     JOIN training_lesson l ON l.id = b.lesson_id
     JOIN training_module m ON m.id = l.module_id
     WHERE b.id = ?`,
  )
    .bind(input.blockId)
    .first<{ id: string; type: string; org_id: string }>();
  if (!block || block.org_id !== input.orgId || !isContentBlockType(parseBlockType(block.type))) {
    throw new Error('Content block not found.');
  }
  await DB.prepare(
    `INSERT INTO training_block_response (user_id, block_id, answers_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, block_id) DO UPDATE SET
       answers_json = excluded.answers_json,
       updated_at = excluded.updated_at`,
  )
    .bind(input.userId, input.blockId, JSON.stringify({ reviewed: true }), nowMs())
    .run();
}

export async function saveContactDetailsResponse(input: {
  userId: string;
  blockId: string;
  orgId: string;
  answers: ContactDetailsAnswers;
}): Promise<{ answers: ContactDetailsAnswers; profileUpdated: string[] }> {
  const { DB } = getEnv();
  const block = await DB.prepare(
    `SELECT b.id, b.type, b.resource_label, m.org_id
     FROM training_block b
     JOIN training_lesson l ON l.id = b.lesson_id
     JOIN training_module m ON m.id = l.module_id
     WHERE b.id = ?`,
  )
    .bind(input.blockId)
    .first<{ id: string; type: string; resource_label: string | null; org_id: string }>();
  if (!block || block.org_id !== input.orgId || block.type !== 'contact') {
    throw new Error('Contact details block not found.');
  }

  const fields = parseContactFields(block.resource_label);
  const existing = (await getBlockResponse(input.userId, input.blockId)) ?? {
    fullName: '',
    phone: '',
    workEmail: '',
    jobTitle: '',
  };
  const answers: ContactDetailsAnswers = { ...existing };

  for (const key of fields) {
    const raw = input.answers[key]?.trim() ?? '';
    if (key === 'fullName') {
      if (raw.length < 2) throw new Error('Enter your name.');
      answers.fullName = raw;
    } else if (key === 'phone') {
      answers.phone = formatPhoneNumber(raw) ?? raw;
    } else if (key === 'workEmail') {
      if (!raw.includes('@')) throw new Error('Enter a valid email.');
      answers.workEmail = raw;
    } else if (key === 'jobTitle') {
      answers.jobTitle = raw;
    }
  }

  await DB.prepare(
    `INSERT INTO training_block_response (user_id, block_id, answers_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, block_id) DO UPDATE SET
       answers_json = excluded.answers_json,
       updated_at = excluded.updated_at`,
  )
    .bind(input.userId, input.blockId, JSON.stringify(answers), nowMs())
    .run();

  const profile = await DB.prepare(
    `SELECT u.name, u.email, p.phone, p.job_title
     FROM user u
     JOIN employee_profile p ON p.user_id = u.id
     WHERE u.id = ?`,
  )
    .bind(input.userId)
    .first<{ name: string; email: string; phone: string | null; job_title: string | null }>();

  const profileUpdated: string[] = [];
  if (profile) {
    const nameEmpty = !profile.name?.trim();
    const phoneEmpty = !profile.phone?.trim();
    const jobEmpty = !profile.job_title?.trim();
    const wantsName = fields.includes('fullName') && nameEmpty && answers.fullName;
    const wantsPhone = fields.includes('phone') && phoneEmpty && answers.phone;
    const wantsJob = fields.includes('jobTitle') && jobEmpty && answers.jobTitle;

    if (wantsName || wantsPhone) {
      await updateDirectoryProfile({
        userId: input.userId,
        ...(wantsName ? { name: answers.fullName } : {}),
        ...(wantsPhone ? { phone: answers.phone } : {}),
        actorUserId: input.userId,
      });
      if (wantsName) profileUpdated.push('name');
      if (wantsPhone) profileUpdated.push('phone');
    }
    if (wantsJob) {
      await updateEmployeeJobTitle({
        userId: input.userId,
        jobTitle: answers.jobTitle,
        actorUserId: input.userId,
      });
      profileUpdated.push('jobTitle');
    }
  }

  return { answers, profileUpdated };
}

export async function getTrainingUserReview(
  orgId: string,
  userId: string,
): Promise<{
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  modules: Array<{
    moduleId: string;
    title: string;
    percent: number;
    complete: boolean;
    lessons: Array<{
      lessonId: string;
      title: string;
      isAssignment: boolean;
      completed: boolean;
      completedAt: number | null;
      ackName: string | null;
      blocks: Array<{
        blockId: string;
        type: TrainingBlockType;
        label: string;
        status: string;
        detail: string | null;
        contactAnswers: ContactDetailsAnswers | null;
        quizAnswers: Array<{ prompt: string; selected: string; correct: string; isCorrect: boolean }> | null;
        docusignStatus: string | null;
      }>;
    }>;
  }>;
} | null> {
  const { DB } = getEnv();
  const person = await DB.prepare(
    `SELECT u.id, u.name, u.email, p.phone, p.job_title
     FROM user u
     JOIN organization_member om ON om.user_id = u.id
     JOIN employee_profile p ON p.user_id = u.id
     WHERE u.id = ? AND om.org_id = ? AND p.status = 'active'`,
  )
    .bind(userId, orgId)
    .first<{
      id: string;
      name: string;
      email: string;
      phone: string | null;
      job_title: string | null;
    }>();
  if (!person) return null;

  const roles = await DB.prepare(
    `SELECT r.key FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = ?`,
  )
    .bind(userId)
    .all<{ key: string }>();
  const roleKeys = (roles.results ?? []).map((r) => r.key);
  const allModules = await listTrainingModules(orgId, { includeHidden: true });
  const visibleModules = allModules.filter(
    (module) => module.visible && moduleVisibleToRoles(module, roleKeys),
  );

  const modules = [];
  for (const module of visibleModules) {
    const progress = await getModuleProgressForUser({
      orgId,
      moduleId: module.id,
      userId,
      roleKeys,
    });
    if (!progress) continue;

    const items = [...progress.lessons, ...progress.assignments];
    const lessons = [];
    for (const lesson of items) {
      const progressRow = await DB.prepare(
        `SELECT completed_at, ack_name FROM training_lesson_progress
         WHERE user_id = ? AND lesson_id = ?`,
      )
        .bind(userId, lesson.id)
        .first<{ completed_at: number; ack_name: string | null }>();
      const blocks = await listBlocks(lesson.id);
      const blockReviews = [];
      for (const block of blocks) {
        if (block.type === 'quiz') {
          const attempt = await DB.prepare(
            `SELECT score, passed, answers_json, created_at
             FROM training_quiz_attempt
             WHERE user_id = ? AND block_id = ?
             ORDER BY created_at DESC LIMIT 1`,
          )
            .bind(userId, block.id)
            .first<{ score: number; passed: number; answers_json: string; created_at: number }>();
          let quizAnswers: Array<{
            prompt: string;
            selected: string;
            correct: string;
            isCorrect: boolean;
          }> | null = null;
          if (attempt) {
            let indexes: number[] = [];
            try {
              const raw = JSON.parse(attempt.answers_json) as unknown;
              indexes = Array.isArray(raw) ? raw.map((n) => Number(n)) : [];
            } catch {
              indexes = [];
            }
            quizAnswers = block.questions.map((question, index) => {
              const chosen = indexes[index];
              const selectedLabel =
                chosen != null && question.options[chosen] != null
                  ? question.options[chosen]!
                  : '(no answer)';
              const correctLabel = question.options[question.correctIndex] ?? '';
              return {
                prompt: question.prompt,
                selected: selectedLabel,
                correct: correctLabel,
                isCorrect: chosen === question.correctIndex,
              };
            });
          }
          blockReviews.push({
            blockId: block.id,
            type: block.type,
            label: 'Quiz',
            status: attempt
              ? attempt.passed === 1
                ? `Passed (${attempt.score}%)`
                : `Not passed (${attempt.score}%)`
              : 'Not submitted',
            detail: null,
            contactAnswers: null,
            quizAnswers,
            docusignStatus: null,
          });
          continue;
        }

        if (block.type === 'ack') {
          blockReviews.push({
            blockId: block.id,
            type: block.type,
            label: 'Acknowledgment',
            status: progressRow?.ack_name ? 'Signed' : lesson.completed ? 'Completed' : 'Pending',
            detail: progressRow?.ack_name
              ? `Acknowledged as “${progressRow.ack_name}”`
              : block.ackPrompt,
            contactAnswers: null,
            quizAnswers: null,
            docusignStatus: null,
          });
          continue;
        }

        if (block.type === 'docusign') {
          const envelope = await DB.prepare(
            `SELECT status, completed_at FROM training_docusign_envelope
             WHERE user_id = ? AND block_id = ?`,
          )
            .bind(userId, block.id)
            .first<{ status: string; completed_at: number | null }>();
          const status = envelope?.status ?? 'missing';
          blockReviews.push({
            blockId: block.id,
            type: block.type,
            label: block.docusignTemplateName || 'DocuSign document',
            status:
              status === 'completed'
                ? 'Signed'
                : status === 'missing'
                  ? 'Not started'
                  : `In progress (${status})`,
            detail: null,
            contactAnswers: null,
            quizAnswers: null,
            docusignStatus: status,
          });
          continue;
        }

        if (block.type === 'contact') {
          const contactAnswers = await getBlockResponse(userId, block.id);
          blockReviews.push({
            blockId: block.id,
            type: block.type,
            label: 'Contact details',
            status: contactAnswers ? 'Submitted' : 'Not submitted',
            detail: null,
            contactAnswers,
            quizAnswers: null,
            docusignStatus: null,
          });
          continue;
        }

        blockReviews.push({
          blockId: block.id,
          type: block.type,
          label:
            block.type === 'video'
              ? 'Video'
              : block.type === 'written'
                ? 'Written'
                : block.type === 'resource'
                  ? 'Resource'
                  : block.type,
          status: lesson.completed ? 'Completed with lesson' : 'Content',
          detail: block.type === 'resource' ? block.resourceLabel || block.resourceUrl : null,
          contactAnswers: null,
          quizAnswers: null,
          docusignStatus: null,
        });
      }

      lessons.push({
        lessonId: lesson.id,
        title: lesson.title,
        isAssignment: lesson.isAssignment,
        completed: lesson.completed,
        completedAt: progressRow?.completed_at ?? null,
        ackName: progressRow?.ack_name ?? null,
        blocks: blockReviews,
      });
    }

    modules.push({
      moduleId: module.id,
      title: module.title,
      percent: progress.percent,
      complete: progress.complete,
      lessons,
    });
  }

  return {
    userId: person.id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    jobTitle: person.job_title,
    modules,
  };
}
