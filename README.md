# Woven Sage employee portal — PREVIEW

This folder is a **separate preview app**. It is not the live marketing website.

| | Preview (this app) | Production website |
|--|--|--|
| What | Private employee portal | wovensage.com |
| Cloudflare name | `wovensage-portal-preview` | Pages project `wovensage` |
| Domain now | local / `*.pages.dev` or workers.dev | wovensage.com |
| Domain later | portal.wovensage.com | unchanged |
| Git branch | `feat/employee-portal-preview` | `master` |
| Auto-deploy | **No** (manual only) | GitHub Action on `master` |

Do not deploy this Worker to the `wovensage` Pages project. Do not merge to `master` until the portal has been reviewed on preview.

## What this portal includes

- Invite-only email/password accounts (no public registration)
- Roles: Owner/Admin, Finance, Manager, Employee/Therapist
- Server-side permission checks, including `financials:view`
- Applications launcher (SimplePractice for clinical tools; QuickBooks for finance)
- Financial dashboard with Jan 1–Aug 17 2026 cash-basis figures
- Cash / reserve lines as dashes until real balances exist
- QuickBooks OAuth scaffolding (connects later; secrets stay on the server)
- Audit log for invite, disable, and role changes
- No patient, clinical, appointment, or insurance data

## Local development

From `portal/`:

```bash
cp .dev.vars.example .dev.vars
# Put long random values in BETTER_AUTH_SECRET and PORTAL_BOOTSTRAP_TOKEN
npm install
npx wrangler d1 migrations apply wovensage-portal-preview --local
npm run dev
```

Open http://localhost:4321/bootstrap, enter the bootstrap token and a password for `admin@wovensage.com`.

## Preview deploy (not production)

1. Create D1: `npx wrangler d1 create wovensage-portal-preview`
2. Put the database id into `wrangler.jsonc`
3. Apply migrations with `--remote`
4. Set encrypted secrets (`BETTER_AUTH_SECRET`, `PORTAL_BOOTSTRAP_TOKEN`, later QuickBooks)
5. `npx wrangler deploy` — deploys Worker **wovensage-portal-preview only**
6. Bootstrap the owner on the preview URL, then remove `PORTAL_BOOTSTRAP_TOKEN`

Production cutover (`portal.wovensage.com`) is a later step and will use a different Worker name / environment.
