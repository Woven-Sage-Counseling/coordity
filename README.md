# Woven Sage employee portal

Private invite-only portal for clinicians and staff. It is a **separate** Cloudflare Pages app from the public marketing site.

| | Employee portal | Public website |
|--|--|--|
| What | Invite-only staff app | wovensage.com |
| Cloudflare project | `wovensage-portal-preview` | `wovensage` |
| Live domain | https://portal.wovensage.com | https://wovensage.com |
| Auto-deploy | GitHub Action on `master` (`portal/**`) | GitHub Action on `master` (root site) |

Do not deploy this app to the `wovensage` Pages project.

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

## Manual deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name=wovensage-portal-preview --branch=master --commit-dirty=true
```
