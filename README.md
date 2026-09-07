# Coordity employee workspace (Woven Sage tenant)

Private invite-only staff app. Product brand is **Coordity**; **Woven Sage Counseling** is the first organization tenant.

| | Workspace app | Woven Sage marketing site |
|--|--|--|
| What | Multi-tenant Coordity portal | Practice website |
| Cloudflare project | `wovensage-portal-preview` | `wovensage` |
| Tenant URL | https://wovensage.coordity.com | https://wovensage.com |
| Product entry | https://coordity.com (workspace finder) | — |
| Legacy host | https://portal.wovensage.com (still resolves to Woven Sage) | — |
| Auto-deploy | GitHub Action on `master` (`portal/**`) | GitHub Action on `master` (root site) |

Do not deploy this app to the `wovensage` Pages project.

## Domains (ops)

1. In Cloudflare Pages for `wovensage-portal-preview`, attach custom domains:
   - `wovensage.coordity.com`
   - `coordity.com` / `www.coordity.com` (apex product shell)
   - keep `portal.wovensage.com` until cutover is complete
2. In DNS for **coordity.com**:
   - `wovensage` → CNAME `wovensage-portal-preview.pages.dev` (proxied)
   - apex/`www` → same Pages project (or Cloudflare recommended apex setup)
3. Optional later: redirect `portal.wovensage.com` → `https://wovensage.coordity.com`
4. Marketing site `providerPortalUrl` points at `https://wovensage.coordity.com`

Wildcard `*.coordity.com` can be added when onboarding more tenants (Pages custom domains or Workers route).

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
- Org-branded sign-in + Coordity apex workspace finder (`/sign-in` on coordity.com)
- Embeddable org sign-in at `/embed/sign-in` (same auth; for practice-site iframes later)

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

Localhost resolves to the Woven Sage tenant (slug `wovensage`).

## Manual deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name=wovensage-portal-preview --branch=master --commit-dirty=true
```
