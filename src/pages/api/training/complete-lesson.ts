import type { APIRoute } from 'astro';
import { latestDocuSignComplete } from '../../../lib/docusign';
import { formErrorRedirect } from '../../../lib/http';
import { orgIdFromLocals } from '../../../lib/organization';
import {
  completeLesson,
  getLesson,
  hasBlockResponse,
  latestQuizPass,
  listBlocks,
} from '../../../lib/training';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }
  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();
  const lessonId = String(form.get('lessonId') ?? '').trim();
  const moduleId = String(form.get('moduleId') ?? '').trim();
  const ackName = String(form.get('ackName') ?? '').trim();
  const returnPath = `/training/${moduleId}/${lessonId}`;

  try {
    const lesson = await getLesson(lessonId);
    if (!lesson || lesson.orgId !== orgId || lesson.moduleId !== moduleId) {
      throw new Error('Lesson not found.');
    }
    const blocks = await listBlocks(lessonId);
    const needsAck = blocks.some((b) => b.type === 'ack');
    if (needsAck && ackName.length < 2) {
      throw new Error(
        lesson.isAssignment
          ? 'Type your full name to acknowledge this assignment.'
          : 'Type your full name to acknowledge this lesson.',
      );
    }
    for (const block of blocks.filter((b) => b.type === 'quiz')) {
      const passed = await latestQuizPass(employee.id, block.id);
      if (!passed) {
        throw new Error(
          lesson.isAssignment
            ? 'Pass all quizzes before completing this assignment.'
            : 'Pass all quizzes before completing this lesson.',
        );
      }
    }
    for (const block of blocks.filter((b) => b.type === 'docusign')) {
      const signed = await latestDocuSignComplete(employee.id, block.id);
      if (!signed) {
        throw new Error(
          lesson.isAssignment
            ? 'Sign all required documents before completing this assignment.'
            : 'Sign all required documents before completing this lesson.',
        );
      }
    }
    for (const block of blocks.filter((b) => b.type === 'contact')) {
      const saved = await hasBlockResponse(employee.id, block.id);
      if (!saved) {
        throw new Error(
          lesson.isAssignment
            ? 'Save your contact details before completing this assignment.'
            : 'Save your contact details before completing this lesson.',
        );
      }
    }
    await completeLesson({
      userId: employee.id,
      lessonId,
      ackName: needsAck ? ackName : null,
    });
    return new Response(null, {
      status: 303,
      headers: { Location: `/training/${moduleId}?saved=lesson`, 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not complete lesson.';
    return formErrorRedirect(returnPath, message);
  }
};
