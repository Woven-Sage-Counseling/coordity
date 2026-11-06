import type { APIRoute } from 'astro';

// SECURITY CONTAINMENT (2026-11-06): public, unauthenticated workspace creation is disabled.
//
// This endpoint used to create an organization for any visitor and redirect them straight to an OWNER invitation link,
// with no authentication, e-mail verification or approval. Workspaces are now created only by:
//   - platform staff holding `platform:orgs:create` (POST /api/platform/orgs/create), or
//   - approving an early-access request in the platform console, which creates the workspace through the same platform
//     path and e-mails the owner invitation to the requester's address (so only the mailbox owner can claim it).
//
// The handler refuses every request and performs no database access. It is also no longer a public middleware path.
export const prerender = false;

export const WORKSPACE_CREATION_DISABLED_MESSAGE =
  'Coordity workspaces are created by invitation. Request early access and we will set up your workspace.';

function refuse(): Response {
  return new Response(JSON.stringify({ error: WORKSPACE_CREATION_DISABLED_MESSAGE }), {
    status: 403,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const POST: APIRoute = async () => refuse();
export const GET: APIRoute = async () => refuse();
