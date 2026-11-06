// SECURITY CONTAINMENT regression tests (2026-11-06): unauthorized workspace creation stays impossible, and the
// legitimate paths (platform staff, approved early access, existing sign-in) keep working.
// Run: npm run test:security   (node:test; no network, no database: every binding is mocked)
import { describe, test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const src = (path: string) => new URL(`src/${path}`, ROOT).href;
const read = (path: string) => readFileSync(new URL(`src/${path}`, ROOT), 'utf8');

// ---- mocks: every module that could touch Cloudflare bindings, e-mail or the database --------------------------------
const calls = {
  createOrganization: 0,
  createPlatformOrganization: [] as Array<Record<string, unknown>>,
  archiveOrganization: [] as string[],
  emails: [] as Array<{ to: string; text: string; html: string }>,
  reviewed: [] as string[],
};
let emailOk = true;
let requestRow: Record<string, unknown> | null = null;

const fakeDb = {
  prepare(sql: string) {
    const stmt = {
      bind: (..._args: unknown[]) => stmt,
      first: async () => (/FROM\s+early_access_request/i.test(sql) ? requestRow : null),
      all: async () => ({ results: [] }),
      run: async () => {
        if (/UPDATE\s+early_access_request/i.test(sql)) calls.reviewed.push(sql);
        return { success: true };
      },
    };
    return stmt;
  },
};

mock.module(src('lib/env.ts'), { namedExports: { getEnv: () => ({ DB: fakeDb }) } });
mock.module(src('lib/email.ts'), {
  namedExports: {
    getCoordityFromEmail: () => 'from@example.test',
    notifyAdminEmail: async (m: { to: string; text: string; html: string }) => {
      calls.emails.push(m);
      return emailOk ? { ok: true } : { ok: false, error: 'mail provider down' };
    },
  },
});
mock.module(src('lib/notifications.ts'), { namedExports: { notifyUser: async () => {} } });
mock.module(src('lib/platform-orgs.ts'), {
  namedExports: {
    createPlatformOrganization: async (input: Record<string, unknown>) => {
      calls.createPlatformOrganization.push(input);
      return { org: { id: 'org_new' }, inviteUrl: 'https://new.coordity.test/accept-invite?token=t0k3n' };
    },
    archiveOrganization: async (id: string) => {
      calls.archiveOrganization.push(id);
      return { id };
    },
  },
});
mock.module(src('lib/organization.ts'), {
  namedExports: {
    createOrganization: async () => {
      calls.createOrganization += 1;
      return { id: 'org_should_never_exist', slug: 'x' };
    },
  },
});

const ACTIVE_OWNER = { userId: 'u_staff', status: 'active', permissions: ['platform:access', 'platform:orgs:create'] };
const ACCESS_ONLY = { userId: 'u_it', status: 'active', permissions: ['platform:access', 'platform:orgs:read'] };

function form(fields: Record<string, string>, path = '/api/x') {
  const body = new URLSearchParams(fields);
  return new Request(`https://coordity.com${path}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

beforeEach(() => {
  calls.createOrganization = 0;
  calls.createPlatformOrganization.length = 0;
  calls.archiveOrganization.length = 0;
  calls.emails.length = 0;
  calls.reviewed.length = 0;
  emailOk = true;
  requestRow = {
    id: 'ear_1', name: 'Pat Example', email: 'pat@practice.test', practice_name: 'Example Practice', phone: null,
    title: null, message: null, status: 'new', resolution: null, created_at: 1, reviewed_at: null, reviewed_by: null,
  };
});

describe('public workspace creation is disabled', () => {
  test('POST /api/orgs/create refuses an anonymous visitor and creates nothing', async () => {
    const { POST } = await import(src('pages/api/orgs/create.ts'));
    const res: Response = await POST({
      request: form({ companyName: 'Attacker Co', adminName: 'A', adminEmail: 'victim@example.test' }, '/api/orgs/create'),
      locals: {},
    } as never);
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('location'), null, 'never redirects to an owner invitation');
    assert.match(await res.text(), /by invitation/);
    assert.equal(calls.createOrganization, 0);
    assert.equal(calls.createPlatformOrganization.length, 0);
  });

  test('it also refuses a signed-in platform owner and a GET: the route has no creation path at all', async () => {
    const { POST, GET } = await import(src('pages/api/orgs/create.ts'));
    for (const handler of [POST, GET]) {
      const res: Response = await handler({
        request: form({ companyName: 'X', adminName: 'Y', adminEmail: 'z@example.test' }, '/api/orgs/create'),
        locals: { isCoordityApex: true, platformStaff: ACTIVE_OWNER },
      } as never);
      assert.equal(res.status, 403);
    }
    assert.equal(calls.createOrganization, 0);
  });

  test('the route source cannot reach organization creation, invitations or the database', () => {
    const route = read('pages/api/orgs/create.ts');
    for (const forbidden of ['createOrganization', 'createInvitation', 'getEnv', 'inviteUrl', "from '../../../lib"]) {
      assert.ok(!route.includes(forbidden), `orgs/create.ts must not reference ${forbidden}`);
    }
  });

  test('the middleware no longer lists /api/orgs/create as public, on tenant hosts or the apex', () => {
    const middleware = read('middleware.ts');
    assert.ok(!middleware.includes('/api/orgs/create'));
  });

  test('the sign-up page has no creation form', () => {
    const page = read('pages/sign-up.astro');
    assert.ok(!/<form/i.test(page));
    assert.ok(!page.includes('/api/orgs/create'));
    assert.ok(page.includes('/early-access'));
  });
});

describe('authorized access still works', () => {
  test('existing sign-in, invitation acceptance and auth routes stay public (Woven Sage login unaffected)', () => {
    const middleware = read('middleware.ts');
    for (const path of ["'/sign-in'", "'/accept-invite'", "'/api/session/sign-in'", "'/api/invites/accept'",
                        "startsWith('/api/auth')", "'/api/orgs/resolve'", "'/early-access'", "'/api/early-access/request'"]) {
      assert.ok(middleware.includes(path), `public path kept: ${path}`);
    }
  });

  test('platform staff with platform:orgs:create can still create a workspace', async () => {
    const { POST } = await import(src('pages/api/platform/orgs/create.ts'));
    const ok: Response = await POST({
      request: form({ companyName: 'Real Practice', adminName: 'Owner', adminEmail: 'owner@real.test' }),
      locals: { isCoordityApex: true, platformStaff: ACTIVE_OWNER },
    } as never);
    assert.equal(ok.status, 303);
    assert.equal(calls.createPlatformOrganization.length, 1);
    assert.equal(calls.createPlatformOrganization[0].adminEmail, 'owner@real.test');
  });

  test('platform staff without platform:orgs:create, and anonymous visitors, cannot', async () => {
    const { POST } = await import(src('pages/api/platform/orgs/create.ts'));
    for (const staff of [ACCESS_ONLY, null, { ...ACTIVE_OWNER, status: 'suspended' }]) {
      const res: Response = await POST({
        request: form({ companyName: 'X', adminName: 'Y', adminEmail: 'z@example.test' }),
        locals: { isCoordityApex: true, platformStaff: staff },
      } as never);
      assert.equal(res.status, 403);
    }
    const tenantHost: Response = await POST({
      request: form({ companyName: 'X', adminName: 'Y', adminEmail: 'z@example.test' }),
      locals: { isCoordityApex: false, platformStaff: ACTIVE_OWNER },
    } as never);
    assert.equal(tenantHost.status, 404);
    assert.equal(calls.createPlatformOrganization.length, 0);
  });
});

describe('approved early access creates the workspace and e-mails the owner invitation to the requester', () => {
  test('approval creates through the platform path and sends the invite to the requester only', async () => {
    const { inviteEarlyAccessRequest } = await import(src('lib/early-access.ts'));
    const result = await inviteEarlyAccessRequest({ id: 'ear_1', reviewedBy: 'u_staff', origin: 'https://coordity.com' });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls.createPlatformOrganization.length, 1);
    assert.deepEqual(
      { company: calls.createPlatformOrganization[0].companyName, email: calls.createPlatformOrganization[0].adminEmail,
        actor: calls.createPlatformOrganization[0].actorUserId },
      { company: 'Example Practice', email: 'pat@practice.test', actor: 'u_staff' },
    );
    assert.equal(calls.emails.length, 1);
    assert.equal(calls.emails[0].to, 'pat@practice.test');
    assert.ok(calls.emails[0].text.includes('accept-invite?token='));
    assert.ok(!calls.emails[0].text.includes('/sign-up'), 'no link to a public creation form');
    assert.equal(calls.reviewed.length, 1);
  });

  test('a failed e-mail archives the new workspace and leaves the request open', async () => {
    emailOk = false;
    const { inviteEarlyAccessRequest } = await import(src('lib/early-access.ts'));
    const result = await inviteEarlyAccessRequest({ id: 'ear_1', reviewedBy: 'u_staff', origin: 'https://coordity.com' });
    assert.equal(result.ok, false);
    assert.deepEqual(calls.archiveOrganization, ['org_new']);
    assert.equal(calls.reviewed.length, 0);
  });

  test('an already-reviewed or missing request creates nothing', async () => {
    const { inviteEarlyAccessRequest } = await import(src('lib/early-access.ts'));
    requestRow = { ...(requestRow as object), status: 'reviewed' };
    assert.equal((await inviteEarlyAccessRequest({ id: 'ear_1', reviewedBy: 'u', origin: 'https://coordity.com' })).ok, false);
    requestRow = null;
    assert.equal((await inviteEarlyAccessRequest({ id: 'nope', reviewedBy: 'u', origin: 'https://coordity.com' })).ok, false);
    assert.equal(calls.createPlatformOrganization.length, 0);
  });

  test('the review action needs platform:orgs:create before it can approve', async () => {
    const { POST } = await import(src('pages/api/platform/requests/review.ts'));
    const denied: Response = await POST({
      request: form({ id: 'ear_1', action: 'invite' }),
      locals: { isCoordityApex: true, platformStaff: ACCESS_ONLY },
      url: new URL('https://coordity.com/api/platform/requests/review'),
    } as never);
    assert.equal(denied.status, 403);
    assert.equal(calls.createPlatformOrganization.length, 0);

    const allowed: Response = await POST({
      request: form({ id: 'ear_1', action: 'invite' }),
      locals: { isCoordityApex: true, platformStaff: ACTIVE_OWNER },
      url: new URL('https://coordity.com/api/platform/requests/review'),
    } as never);
    assert.equal(allowed.status, 303);
    assert.equal(calls.createPlatformOrganization.length, 1);
  });
});
