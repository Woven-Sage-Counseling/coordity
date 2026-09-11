import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { orgIdFromLocals } from '../../../lib/organization';
import { getLesson, listBlocks, submitQuizAttempt } from '../../../lib/training';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }
  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();
  const blockId = String(form.get('blockId') ?? '').trim();
  const lessonId = String(form.get('lessonId') ?? '').trim();
  const moduleId = String(form.get('moduleId') ?? '').trim();
  const returnPath = `/training/${moduleId}/${lessonId}`;

  try {
    const lesson = await getLesson(lessonId);
    if (!lesson || lesson.orgId !== orgId) throw new Error('Lesson not found.');
    const blocks = await listBlocks(lessonId);
    const block = blocks.find((item) => item.id === blockId && item.type === 'quiz');
    if (!block) throw new Error('Quiz not found.');

    const answers: number[] = [];
    for (let i = 0; i < block.questions.length; i += 1) {
      const value = Number(String(form.get(`q_${i}`) ?? '').trim());
      if (!Number.isInteger(value)) throw new Error('Answer every question.');
      answers.push(value);
    }

    const result = await submitQuizAttempt({
      userId: employee.id,
      blockId,
      answers,
    });

    return new Response(null, {
      status: 303,
      headers: {
        Location: `${returnPath}?score=${result.score}&passed=${result.passed ? 1 : 0}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not submit quiz.';
    return formErrorRedirect(returnPath, message);
  }
};
