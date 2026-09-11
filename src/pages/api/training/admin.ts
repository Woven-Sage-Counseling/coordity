import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgIdFromLocals } from '../../../lib/organization';
import {
  addQuizQuestion,
  archiveModule,
  createBlock,
  createLesson,
  createModuleFromTemplate,
  deleteBlock,
  deleteLesson,
  getTrainingModule,
  updateBlock,
  updateLesson,
  updateModule,
  type TrainingBlockType,
} from '../../../lib/training';

export const prerender = false;

function wantsJson(request: Request): boolean {
  return request.headers.get('X-Requested-With') === 'training-autosave';
}

function jsonOk(extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...extra }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function jsonError(message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function redirectAdmin(opts?: {
  moduleId?: string;
  itemId?: string;
  view?: 'settings';
}): Response {
  const params = new URLSearchParams();
  if (opts?.moduleId) params.set('module', opts.moduleId);
  if (opts?.itemId) params.set('item', opts.itemId);
  if (opts?.view === 'settings') params.set('view', 'settings');
  const qs = params.toString();
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/admin${qs ? `?${qs}` : ''}#training`,
      'Cache-Control': 'no-store',
    },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;
  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();
  // Submit buttons may send a second `action` after a hidden field; prefer the last one.
  const actionValues = form.getAll('action').map((v) => String(v).trim()).filter(Boolean);
  const action = actionValues[actionValues.length - 1] ?? '';
  const asJson = wantsJson(request);

  try {
    if (action === 'create-module') {
      const templateId = String(form.get('templateId') ?? 'custom').trim() || 'custom';
      const title = String(form.get('title') ?? '').trim();
      const description = String(form.get('description') ?? '').trim();
      const roleKeys = form.getAll('roleKeys').map((v) => String(v));
      if (roleKeys.length === 0) throw new Error('Assign at least one role.');
      const created = await createModuleFromTemplate({
        orgId,
        templateId,
        title,
        description,
        roleKeys,
      });
      return redirectAdmin({ moduleId: created.id });
    }

    if (action === 'update-module') {
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const title = String(form.get('title') ?? '').trim();
      const description = String(form.get('description') ?? '').trim();
      const roleKeys = form.getAll('roleKeys').map((v) => String(v));
      const existing = await getTrainingModule(moduleId, orgId);
      if (!existing) throw new Error('Module not found.');
      if (existing.kind === 'custom' && roleKeys.length === 0) {
        throw new Error('Assign at least one role to custom modules.');
      }
      await updateModule({
        orgId,
        moduleId,
        title,
        description,
        roleKeys,
      });
      if (asJson) return jsonOk({ moduleId });
      return redirectAdmin({ moduleId, view: 'settings' });
    }

    if (action === 'archive-module') {
      await archiveModule(orgId, String(form.get('moduleId') ?? '').trim());
      return redirectAdmin();
    }

    if (action === 'create-lesson') {
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const title = String(form.get('title') ?? '').trim();
      const isAssignment = String(form.get('isAssignment') ?? '') === '1';
      if (!title) throw new Error(isAssignment ? 'Assignment title is required.' : 'Lesson title is required.');
      const created = await createLesson({ orgId, moduleId, title, isAssignment });
      return redirectAdmin({ moduleId, itemId: created.id });
    }

    if (action === 'update-lesson') {
      const lessonId = String(form.get('lessonId') ?? '').trim();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const roleKeys = form.getAll('lessonRoleKeys').map((v) => String(v));
      const availableRoleKeys = form.getAll('availableLessonRoleKeys').map((v) => String(v));
      const title = String(form.get('title') ?? '');
      await updateLesson({
        orgId,
        lessonId,
        title,
        required: String(form.get('required') ?? '') === '1',
        roleKeys,
        availableRoleKeys,
      });
      if (asJson) return jsonOk({ moduleId, itemId: lessonId, title: title.trim() });
      return redirectAdmin({ moduleId, itemId: lessonId });
    }

    if (action === 'delete-lesson') {
      const moduleId = String(form.get('moduleId') ?? '').trim();
      await deleteLesson(orgId, String(form.get('lessonId') ?? '').trim());
      return redirectAdmin({ moduleId });
    }

    if (action === 'create-block') {
      const lessonId = String(form.get('lessonId') ?? '').trim();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const type = String(form.get('type') ?? '').trim() as TrainingBlockType;
      await createBlock({
        orgId,
        lessonId,
        type,
        youtubeUrl: String(form.get('youtubeUrl') ?? ''),
        bodyText: String(form.get('bodyText') ?? ''),
        resourceUrl: String(form.get('resourceUrl') ?? ''),
        resourceLabel: String(form.get('resourceLabel') ?? ''),
        ackPrompt: String(form.get('ackPrompt') ?? ''),
        passPercent: Number(form.get('passPercent') ?? 80) || 80,
      });
      return redirectAdmin({ moduleId, itemId: lessonId });
    }

    if (action === 'update-block') {
      const blockId = String(form.get('blockId') ?? '').trim();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const lessonId = String(form.get('lessonId') ?? '').trim();
      await updateBlock({
        orgId,
        blockId,
        ...(form.has('youtubeUrl')
          ? { youtubeUrl: String(form.get('youtubeUrl') ?? '') }
          : {}),
        ...(form.has('bodyText') ? { bodyText: String(form.get('bodyText') ?? '') } : {}),
        ...(form.has('resourceUrl')
          ? { resourceUrl: String(form.get('resourceUrl') ?? '') }
          : {}),
        ...(form.has('resourceLabel')
          ? { resourceLabel: String(form.get('resourceLabel') ?? '') }
          : {}),
        ...(form.has('ackPrompt') ? { ackPrompt: String(form.get('ackPrompt') ?? '') } : {}),
        ...(form.has('passPercent')
          ? { passPercent: Number(form.get('passPercent') ?? 80) || 80 }
          : {}),
      });
      if (asJson) return jsonOk({ moduleId, itemId: lessonId, blockId });
      return redirectAdmin({
        moduleId,
        ...(lessonId ? { itemId: lessonId } : {}),
      });
    }

    if (action === 'delete-block') {
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const lessonId = String(form.get('lessonId') ?? '').trim();
      await deleteBlock(orgId, String(form.get('blockId') ?? '').trim());
      return redirectAdmin({
        moduleId,
        ...(lessonId ? { itemId: lessonId } : {}),
      });
    }

    if (action === 'add-question') {
      const blockId = String(form.get('blockId') ?? '').trim();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const lessonId = String(form.get('lessonId') ?? '').trim();
      const prompt = String(form.get('prompt') ?? '').trim();
      const options = [0, 1, 2, 3]
        .map((i) => String(form.get(`option${i}`) ?? '').trim())
        .filter(Boolean);
      const correctIndex = Number(form.get('correctIndex') ?? 0);
      await addQuizQuestion({ orgId, blockId, prompt, options, correctIndex });
      return redirectAdmin({
        moduleId,
        ...(lessonId ? { itemId: lessonId } : {}),
      });
    }

    throw new Error('Unknown action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update training.';
    if (asJson) return jsonError(message);
    return formErrorRedirect('/admin', message, 'trainingError');
  }
};
