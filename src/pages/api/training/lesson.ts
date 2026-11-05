import type { APIRoute } from 'astro';
import { orgIdFromLocals } from '../../../lib/organization';
import { getLesson, listBlocks, moduleVisibleToRoles, getTrainingModule } from '../../../lib/training';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const lessonId = url.searchParams.get('lessonId') ?? '';
  const moduleId = url.searchParams.get('moduleId') ?? '';
  const orgId = orgIdFromLocals(locals.organization);
  const lesson = await getLesson(lessonId);
  const module = await getTrainingModule(moduleId, orgId);
  if (!lesson || !module || lesson.orgId !== orgId || lesson.moduleId !== moduleId || !moduleVisibleToRoles(module, employee.roles)) {
    return new Response(JSON.stringify({ error: 'Lesson not found.' }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const blocks = await listBlocks(lessonId);
  return new Response(
    JSON.stringify({
      ok: true,
      lesson: {
        id: lesson.id,
        title: lesson.title,
        isAssignment: lesson.isAssignment,
        blocks: blocks.map((block) => ({
          id: block.id,
          type: block.type,
          required: block.required,
          bodyText: block.bodyText ?? '',
          youtubeUrl: block.youtubeUrl ?? '',
          resourceUrl: block.resourceUrl ?? '',
          resourceLabel: block.resourceLabel ?? '',
          ackPrompt: block.ackPrompt ?? '',
          questions: block.questions.map((question) => ({
            prompt: question.prompt,
            options: question.options,
          })),
        })),
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
