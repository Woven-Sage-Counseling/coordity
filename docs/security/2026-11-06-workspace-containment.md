# Security containment: public workspace creation and tenant isolation (2026-11-06)

**Branch:** `security/contain-public-workspace-creation`, local only. **Not deployed, not pushed.**

**Basis:** code review only. No live requests, no database queries, no customer records.

## 1. Findings

| # | Finding | Severity | Status in this branch |
|---|---|---|---|
| F1 | `POST /api/orgs/create` (public, linked from the landing page as "Create a workspace") created a workspace for any visitor and redirected them straight to an **owner** invitation link. No authentication, e-mail verification or approval. Live since `131cccf` (2026-09-07). | High | **Fixed (contained)** |
| F2 | The early-access "invite" e-mailed a link to that same public form. Approval was never enforced. | High (same root cause) | **Fixed** |
| F3 | Organization-wide features read tables without `org_id`. Any member of any workspace can read other workspaces' rows (details in section 3). | High while more than one workspace exists | **Not fixed here.** Requires the isolation release (section 3) before a second practice is admitted. |
| F4 | `notifyUsersByRoleKeys` targets users by role across **all** workspaces, so one workspace's events can notify another's managers. | Medium | not fixed (part of F3) |
| F5 | `user_role` and `audit_log` are global (no `org_id`). | Medium | not fixed (part of F3) |

## 2. Containment patch (F1, F2)

| File | Change |
|---|---|
| `src/pages/api/orgs/create.ts` | Refuses every request with 403 (POST and GET). No imports beyond a type, no database access, no redirect. |
| `src/middleware.ts` | `/api/orgs/create` removed from both public path lists (tenant hosts and apex): defence in depth. |
| `src/lib/early-access.ts` | Approving a request creates the workspace through `createPlatformOrganization` (the staff path) and **e-mails the owner invitation to the requester's address**. A failed e-mail archives the new workspace and leaves the request open. The public sign-up link builder is removed. |
| `src/pages/api/platform/requests/review.ts` | The `invite` action now also requires `platform:orgs:create`, matching direct creation. |
| `src/pages/sign-up.astro`, `CoordityLanding.astro`, `continue.astro` | No form. "Request early access" replaces "Create a workspace". Cosmetic only; the control is server-side. |
| `tests/security/*`, `package.json` (`test:security`), `tsconfig.json` (exclude `tests`) | Regression tests on `node:test`; no new dependency. |

**Unchanged:**
- sign-in, sessions, `/api/auth`, invitation acceptance, workspace resolution;
- platform console sign-in;
- direct staff creation (`/api/platform/orgs/create`, `platform:orgs:create`);
- every tenant feature;
- **no database migration.**

**Verification (local):**
- `npm run test:security`: 12/12 pass. The tests cover:
  - anonymous and platform-owner POST and GET refused, with no creation and no redirect;
  - the route source cannot reach creation, invitations or the database;
  - the middleware no longer lists the route;
  - the sign-up page has no form;
  - sign-in, invitation acceptance and auth paths are still public;
  - staff with and without the permission (and suspended staff, and tenant hosts) behave correctly;
  - approval creates through the platform path and e-mails only the requester;
  - a failed e-mail archives the workspace;
  - reviewed or missing requests create nothing;
  - the review action needs `platform:orgs:create`.
- `npm run build` (= `astro check && astro build`, the CI gate): 0 errors, 0 warnings; build complete.

## 3. Tenant-isolation review (F3–F5): required before admitting a second practice

Tables without `org_id` that hold organization-wide or reviewer-visible data, and the functions that read them without
an organization filter:

| Area | Tables | Unscoped readers (examples) | Exposure |
|---|---|---|---|
| Announcements | `announcement`, `announcement_read`, `announcement_dismiss` | `listActiveAnnouncements`, `listAnnouncementsForUser`, `countUnreadAnnouncements` | every workspace's announcements to any member |
| Time off | `time_off_request` (free-text `notes`), `time_off_entry` | `listTimeOffRequestsForAdmin` (`WHERE status = 'pending'`), `listUsersOnApprovedTimeOffNow` | names, dates and notes to reviewers of any workspace |
| Timesheets | `timesheet_shift`, `_backlog`, `_shift_edit`, `_shift_break`, `_shift_work_item`, `timesheet_entry` | `listActiveShiftUserIds`, the backlog and shift-edit review lists, `listOnBreakUserIds` | who is working or on break, and pending requests, across workspaces |
| Credentialing | `insurance_group`, `insurance_plan`, `credentialing_provider`, `provider_plan_coverage`, `provider_group_coverage` | `listInsuranceCatalog`, `listCredentialingProviders`, the coverage matrices | catalog and provider credentialing status shared across workspaces, and writable by any credentialing admin |
| Teams and channels | `directory_team`, `user_team` | `ensureChannels`, `listDirectory`, `loadEmployee` | team channels can span workspaces |
| Notifications | `notification` | `notifyUsersByRoleKeys` | cross-workspace notifications |
| Roles and audit | `user_role`, `audit_log`, `cash_account_balance`, `reserve_setting` | `userHasOwnerRole`, `countActiveOwners`, `writeAuditLog` | roles and audit not per-workspace |

**Lower risk** (per-user rows, read by the owning user): `user_task`, own timesheet rows, training progress and
responses and uploads, Google Calendar connection. These still need an `org_id` for correct multi-workspace users.

**Isolation release (next, separately authorized):**
1. Migrations adding `org_id` to the tables above, with a backfill of `org_wovensage` for every existing row.
2. An organization parameter on every listed function (`orgIdFromLocals(locals.organization)`), and `WHERE org_id = ?`
   on every read and write.
3. Organization-scoped role assignment (replace global `user_role` checks).
4. `notifyUsersByRoleKeys` scoped to the workspace.
5. Remove "default org only" pre-migration fallbacks.
6. Tests: two seeded workspaces; every API route proves no cross-workspace read or write.

## 4. Release procedure (no staging environment exists)

**This change has no migration**, so the database is untouched and rollback is a pure code rollback.

1. **Review:** the Founder reviews `git diff master...security/contain-public-workspace-creation`.
2. **Local gate:** `npm ci && npm run build && npm run test:security` (all pass).
3. **Preview, optional:** `npx wrangler pages deploy dist --project-name=wovensage-portal-preview --branch=containment`.
   - A preview URL on `*.pages.dev`. It **shares the production bindings** (no separate preview bindings are
     configured), so check only pages and the GET probe below. Never submit forms there.
4. **Production:** merge into `master` and push. The existing GitHub Action applies migrations (none here), builds and
   deploys. Alternatively, use the README's manual `wrangler pages deploy … --branch=master`.
5. **Post-deploy verification (no side effects):**
   - `curl -s -o /dev/null -w '%{http_code}' https://coordity.com/api/orgs/create` must answer **403**. The old build
     has no GET handler, so 403 proves the new build is live without sending a creation request.
   - `https://coordity.com/sign-up` shows "Workspaces are by invitation".
   - The Founder signs in at `wovensage.coordity.com` as usual (Woven Sage unaffected).
   - The platform console still loads its organizations and requests.
6. **Rollback:** Cloudflare Pages → `wovensage-portal-preview` → Deployments → the previous production deployment →
   **Rollback** (instant). Or `git revert` the merge and push. No data to restore.

**Then, separately authorized, read-only:** list workspaces and pending invitations, without staff data.
- `SELECT id, slug, created_at, archived_at FROM organization ORDER BY created_at`
- `SELECT org_id, COUNT(*) FROM invitation WHERE status = 'pending' GROUP BY org_id`

Any workspace that is not Woven Sage and was not created by platform staff came from the public form. Archive it in
the platform console, and revoke its invitations after review.

## 5. Approvals needed

1. Merge and push (or manual production deploy) of this branch.
2. The read-only workspace and invitation check, and any resulting archive or revoke.
3. Authorization for the isolation release (section 3) before any second practice is admitted.
