import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgIdFromLocals } from '../../../lib/organization';
import {
  addQuizQuestion,
  archiveModule,
  createBlock,
  createCustomModule,
  createLesson,
  deleteBlock,
  deleteLesson,
  getTrainingModule,
  updateBlock,
  updateLesson,
  updateModule,
  type TrainingBlockType,
} from '../../../lib/training';

export const prerender = false;

function redirectAdmin(extra = ''): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/admin?trainingSaved=1${extra}#training`,
      'Cache-Control': 'no-store',
    },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;
  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();
  const action = String(form.get('action') ?? '').trim();

  try {
    if (action === 'create-module') {
      const title = String(form.get('title') ?? '').trim();
      const description = String(form.get('description') ?? '').trim();
      const roleKeys = form.getAll('roleKeys').map((v) => String(v));
      if (!title) throw new Error('Module title is required.');
      if (roleKeys.length === 0) throw new Error('Assign at least one role.');
      await createCustomModule({ orgId, title, description, roleKeys });
      return redirectAdmin();
    }

    if (action === 'update-module') {
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const title = String(form.get('title') ?? '').trim();
      const description = String(form.get('description') ?? '').trim();
      const visible = String(form.get('visible') ?? '') === '1';
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
        visible,
        roleKeys,
      });
      return redirectAdmin(`&module=${encodeURIComponent(moduleId)}`);
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
      await createLesson({ orgId, moduleId, title, isAssignment });
      return redirectAdmin(`&module=${encodeURIComponent(moduleId)}`);
    }

    if (action === 'update-lesson') {
      const lessonId = String(form.get('lessonId') ?? '').trim();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      await updateLesson({
        orgId,
        lessonId,
        title: String(form.get('title') ?? ''),
        required: String(form.get('required') ?? '') === '1',
      });
      return redirectAdmin(`&module=${encodeURIComponent(moduleId)}`);
    }

    if (action === 'delete-lesson') {
      const lessonId = String(form.get('lessonId') ?? '').trim();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      await deleteLesson(orgId, lessonId);
      return redirectAdmin(`&module=${encodeURIComponent(moduleId)}`);
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
      return redirectAdmin(`&module=${encodeURIComponent(moduleId)}`);
    }

    if (action === 'update-block') {
      const blockId = String(form.get('blockId') ?? '').trim();
      const moduleId = String(form.get('moduleId') ?? '').trim();
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
      return redirectAdmin(`&module=${encodeURIComponent(moduleId)}`);
    }

    if (action === 'delete-block') {
      const blockId = String(form.get('blockId') ?? '').trim();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      await deleteBlock(orgId, blockId);
      return redirectAdmin(`&module=${encodeURIComponent(moduleId)}`);
    }

    if (action === 'add-question') {
      const blockId = String(form.get('blockId') ?? '').trim();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const prompt = String(form.get('prompt') ?? '').trim();
      const options = [0, 1, 2, 3]
        .map((i) => String(form.get(`option${i}`) ?? '').trim())
        .filter(Boolean);
      const correctIndex = Number(form.get('correctIndex') ?? 0);
      await addQuizQuestion({ orgId, blockId, prompt, options, correctIndex });
      return redirectAdmin(`&module=${encodeURIComponent(moduleId)}`);
    }

    throw new Error('Unknown action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update training.';
    return formErrorRedirect('/admin', message, 'trainingError');
  }
};
