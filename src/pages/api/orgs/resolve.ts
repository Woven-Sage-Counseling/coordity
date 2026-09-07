import type { APIRoute } from 'astro';
import {
  findOrganizationsByQuery,
  getOrganizationBySlug,
  tenantOrigin,
} from '../../../lib/organization';
import { publicApiCorsHeaders } from '../../../lib/public-api-cors';

export const prerender = false;

export const OPTIONS: APIRoute = async ({ request }) => {
  return new Response(null, {
    status: 204,
    headers: publicApiCorsHeaders(request, {
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-max-age': '86400',
    }),
  });
};

export const GET: APIRoute = async ({ request, url }) => {
  const headers = publicApiCorsHeaders(request, { 'cache-control': 'no-store' });
  const slug = String(url.searchParams.get('slug') ?? '').trim().toLowerCase();
  const q = String(url.searchParams.get('q') ?? '').trim();

  try {
    if (slug) {
      const org = await getOrganizationBySlug(slug);
      if (!org) {
        return new Response(JSON.stringify({ ok: false, error: 'Workspace not found.' }), {
          status: 404,
          headers,
        });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          organization: {
            id: org.id,
            slug: org.slug,
            name: org.displayName,
            logoUrl: org.logoUrl,
            websiteUrl: org.websiteUrl,
            origin: tenantOrigin(org.slug, request.url),
          },
        }),
        { status: 200, headers },
      );
    }

    if (q.length < 2) {
      return new Response(JSON.stringify({ ok: true, organizations: [] }), {
        status: 200,
        headers,
      });
    }

    const organizations = (await findOrganizationsByQuery(q)).map((org) => ({
      id: org.id,
      slug: org.slug,
      name: org.displayName,
      logoUrl: org.logoUrl,
      websiteUrl: org.websiteUrl,
      origin: tenantOrigin(org.slug, request.url),
    }));

    return new Response(JSON.stringify({ ok: true, organizations }), {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not resolve workspace.';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers,
    });
  }
};
