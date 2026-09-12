import type { APIRoute } from 'astro';
import {
  createEmbeddedSigningSession,
  getDocuSignEnvelopeForUser,
  getEnvelopeStatus,
  upsertTrainingEnvelope,
} from '../../../../lib/docusign';
import { formErrorRedirect } from '../../../../lib/http';
import { orgCanonicalOrigin, orgIdFromLocals } from '../../../../lib/organization';
import { getLesson, listBlocks } from '../../../../lib/training';

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
    if (!lesson || lesson.orgId !== orgId || lesson.moduleId !== moduleId) {
      throw new Error('Lesson not found.');
    }
    const blocks = await listBlocks(lessonId);
    const block = blocks.find((item) => item.id === blockId && item.type === 'docusign');
    if (!block?.docusignTemplateId) {
      throw new Error('This document is not configured yet.');
    }

    const existing = await getDocuSignEnvelopeForUser(employee.id, blockId);
    if (existing?.status === 'completed') {
      return new Response(null, {
        status: 303,
        headers: { Location: returnPath, 'Cache-Control': 'no-store' },
      });
    }

    const origin = orgCanonicalOrigin(locals.organization, request.url);
    const returnUrl = `${origin}/api/training/docusign/return?moduleId=${encodeURIComponent(moduleId)}&lessonId=${encodeURIComponent(lessonId)}&blockId=${encodeURIComponent(blockId)}`;
    const session = await createEmbeddedSigningSession({
      orgId,
      templateId: block.docusignTemplateId,
      signerName: employee.name || employee.email,
      signerEmail: employee.email,
      clientUserId: employee.id,
      returnUrl,
      emailSubject: block.docusignTemplateName || block.bodyText || 'Please sign this document',
    });

    await upsertTrainingEnvelope({
      orgId,
      blockId,
      lessonId,
      userId: employee.id,
      envelopeId: session.envelopeId,
      status: 'sent',
    });

    return new Response(null, {
      status: 303,
      headers: { Location: session.signingUrl, 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start DocuSign signing.';
    return formErrorRedirect(returnPath, message);
  }
};

/** Resume an in-progress envelope if DocuSign still has it open. */
export const GET: APIRoute = async ({ locals, url }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }
  const orgId = orgIdFromLocals(locals.organization);
  const blockId = url.searchParams.get('blockId') ?? '';
  const lessonId = url.searchParams.get('lessonId') ?? '';
  const moduleId = url.searchParams.get('moduleId') ?? '';
  const returnPath = `/training/${moduleId}/${lessonId}`;

  try {
    const existing = await getDocuSignEnvelopeForUser(employee.id, blockId);
    if (!existing) throw new Error('No signing session found.');
    if (existing.status === 'completed') {
      return new Response(null, {
        status: 303,
        headers: { Location: returnPath, 'Cache-Control': 'no-store' },
      });
    }
    const status = await getEnvelopeStatus(orgId, existing.envelopeId);
    await upsertTrainingEnvelope({
      orgId,
      blockId,
      lessonId,
      userId: employee.id,
      envelopeId: existing.envelopeId,
      status,
    });
    if (status === 'completed') {
      return new Response(null, {
        status: 303,
        headers: { Location: returnPath, 'Cache-Control': 'no-store' },
      });
    }
    throw new Error('Start signing again from the lesson.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not resume signing.';
    return formErrorRedirect(returnPath, message);
  }
};
