import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';

export const TASK_ASSIGNED_SOURCE = 'task_assigned';
export const TASK_TITLE_MAX = 500;

export interface UserTask {
  id: string;
  assigneeId: string;
  assigneeName: string;
  title: string;
  createdBy: string;
  createdByName: string;
  completedAt: number | null;
  createdAt: number;
  assigned: boolean;
}

type TaskRow = {
  id: string;
  assignee_id: string;
  assignee_name: string;
  title: string;
  created_by: string;
  created_by_name: string;
  completed_at: number | null;
  created_at: number;
};

function mapTask(row: TaskRow): UserTask {
  return {
    id: row.id,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    title: row.title,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    assigned: row.created_by !== row.assignee_id,
  };
}

const TASK_SELECT = `
  SELECT
    t.id,
    t.assignee_id,
    assignee.name AS assignee_name,
    t.title,
    t.created_by,
    creator.name AS created_by_name,
    t.completed_at,
    t.created_at
  FROM user_task t
  JOIN user assignee ON assignee.id = t.assignee_id
  JOIN user creator ON creator.id = t.created_by
`;

export function formatTaskDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function serializeTask(task: UserTask) {
  return {
    id: task.id,
    title: task.title,
    completed: task.completedAt != null,
    assigned: task.assigned,
    createdByName: task.createdByName,
    createdAtLabel: formatTaskDate(task.createdAt),
  };
}

export async function listTasksForUser(userId: string, limit = 50): Promise<UserTask[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `${TASK_SELECT}
     WHERE t.assignee_id = ?
     ORDER BY
       CASE WHEN t.completed_at IS NULL THEN 0 ELSE 1 END,
       t.created_at DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<TaskRow>();

  return (rows.results ?? []).map(mapTask);
}

export async function listAssignedTasksForAdmin(limit = 100): Promise<UserTask[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `${TASK_SELECT}
     WHERE t.created_by != t.assignee_id
     ORDER BY
       CASE WHEN t.completed_at IS NULL THEN 0 ELSE 1 END,
       t.created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<TaskRow>();

  return (rows.results ?? []).map(mapTask);
}

async function assertActiveUser(userId: string): Promise<void> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT u.id
     FROM user u
     JOIN employee_profile p ON p.user_id = u.id
     WHERE u.id = ? AND p.status = 'active'`,
  )
    .bind(userId)
    .first<{ id: string }>();

  if (!row) {
    throw new Error('That person is not an active portal user.');
  }
}

export async function createTask(input: {
  title: string;
  assigneeId: string;
  createdBy: string;
}): Promise<UserTask> {
  const title = input.title.trim();
  if (!title) throw new Error('Enter a task description.');
  if (title.length > TASK_TITLE_MAX) {
    throw new Error(`Tasks must be ${TASK_TITLE_MAX} characters or fewer.`);
  }

  await assertActiveUser(input.assigneeId);

  const id = randomToken(16);
  const createdAt = nowMs();
  const { DB } = getEnv();

  await DB.prepare(
    `INSERT INTO user_task
       (id, assignee_id, title, created_by, completed_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
  )
    .bind(id, input.assigneeId, title, input.createdBy, createdAt)
    .run();

  const rows = await DB.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(id).all<TaskRow>();
  const row = rows.results?.[0];
  if (!row) throw new Error('Unable to create that task.');
  return mapTask(row);
}

export async function setTaskCompleted(
  taskId: string,
  userId: string,
  completed: boolean,
): Promise<UserTask> {
  const { DB } = getEnv();
  const existing = await DB.prepare(
    `SELECT assignee_id FROM user_task WHERE id = ?`,
  )
    .bind(taskId)
    .first<{ assignee_id: string }>();

  if (!existing) throw new Error('Task not found.');
  if (existing.assignee_id !== userId) {
    throw new Error('You can only update your own tasks.');
  }

  const completedAt = completed ? nowMs() : null;
  await DB.prepare(`UPDATE user_task SET completed_at = ? WHERE id = ?`)
    .bind(completedAt, taskId)
    .run();

  const rows = await DB.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(taskId).all<TaskRow>();
  const row = rows.results?.[0];
  if (!row) throw new Error('Task not found.');
  return mapTask(row);
}

export async function updateTaskTitle(
  taskId: string,
  userId: string,
  title: string,
): Promise<UserTask> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Enter a task description.');
  if (trimmed.length > TASK_TITLE_MAX) {
    throw new Error(`Tasks must be ${TASK_TITLE_MAX} characters or fewer.`);
  }

  const { DB } = getEnv();
  const existing = await DB.prepare(`SELECT assignee_id FROM user_task WHERE id = ?`)
    .bind(taskId)
    .first<{ assignee_id: string }>();

  if (!existing) throw new Error('Task not found.');
  if (existing.assignee_id !== userId) {
    throw new Error('You can only update your own tasks.');
  }

  await DB.prepare(`UPDATE user_task SET title = ? WHERE id = ?`).bind(trimmed, taskId).run();

  const rows = await DB.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(taskId).all<TaskRow>();
  const row = rows.results?.[0];
  if (!row) throw new Error('Task not found.');
  return mapTask(row);
}

export async function deleteTask(
  taskId: string,
  actorId: string,
  canManage: boolean,
): Promise<void> {
  const { DB } = getEnv();
  const existing = await DB.prepare(
    `SELECT assignee_id, created_by FROM user_task WHERE id = ?`,
  )
    .bind(taskId)
    .first<{ assignee_id: string; created_by: string }>();

  if (!existing) throw new Error('Task not found.');

  const isAssignee = existing.assignee_id === actorId;
  const isAssignedByAdmin =
    existing.created_by !== existing.assignee_id && existing.created_by === actorId;

  if (!isAssignee && !(canManage && (isAssignedByAdmin || existing.created_by !== existing.assignee_id))) {
    throw new Error('You do not have permission to delete that task.');
  }

  await DB.prepare(`DELETE FROM user_task WHERE id = ?`).bind(taskId).run();
}
