# Woven Sage employee portal — PREVIEW

This folder is a **separate preview app**. It is not the live marketing website.

| | Preview (this app) | Production website |
|--|--|--|
| What | Private employee portal | wovensage.com |
| Cloudflare name | `wovensage-portal-preview` | Pages project `wovensage` |
| Domain now | https://wovensage-portal-preview.pages.dev | wovensage.com |
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

## Live preview (not production)

The preview portal is deployed to a **separate** Cloudflare Pages project named `wovensage-portal-preview`.

- Preview: https://wovensage-portal-preview.pages.dev
- Production website, unchanged: https://wovensage.com

Create the owner account at https://wovensage-portal-preview.pages.dev/bootstrap using the token in the gitignored file `portal/.preview-bootstrap.txt`. Use email **admin@wovensage.com** and a password of at least 12 characters.

## Preview deploy (not production)

Do not deploy this app to the `wovensage` Pages project. Use:

```bash
npx wrangler pages deploy dist --project-name=wovensage-portal-preview --branch=feat/employee-portal-preview
```

Production cutover (`portal.wovensage.com`) is a later step.
