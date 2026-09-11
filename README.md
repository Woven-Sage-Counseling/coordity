# Coordity — multi-tenant employee workspace platform

Private invite-only staff app for counseling practices and similar orgs.

| | |
|--|--|
| Product | **Coordity** |
| Cloudflare Pages | `wovensage-portal-preview` |
| Apex | https://coordity.com |
| Example tenant | https://wovensage.coordity.com |
| Legacy host | https://portal.wovensage.com → Woven Sage tenant |

Woven Sage Counseling is the first tenant — not the product. Marketing site: [wovensage](https://github.com/Woven-Sage-Counseling/wovensage).

## Local development

```bash
npm install
npm run db:migrate:local
npm run dev
```

Open http://localhost:4321/bootstrap for first-time setup (bootstrap token + password for the seed admin). Localhost resolves to the Woven Sage tenant (slug `wovensage`).

## Deploy

Pushes to `master` deploy via GitHub Actions (`.github/workflows/deploy.yml`).

Required GitHub secrets:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Pages + D1 + Workers |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |
| `RESEND_API_KEY` | Transactional email (optional sync step) |

Manual deploy:

```bash
npm run build
npx wrangler pages deploy dist --project-name=wovensage-portal-preview --branch=master --commit-dirty=true
```

## Domains (ops)

1. Cloudflare Pages project `wovensage-portal-preview` custom domains:
   - `wovensage.coordity.com`
   - `coordity.com` / `www.coordity.com`
   - keep `portal.wovensage.com` if desired
2. DNS for **coordity.com**:
   - `wovensage` → CNAME `wovensage-portal-preview.pages.dev` (proxied)
   - `*` → CNAME `wovensage-portal-preview.pages.dev` (proxied)
   - apex / `www` → same Pages project
3. Tenant wildcard (Pages cannot bind `*.coordity.com` directly):
   - Worker `coordity-tenant-router` in `tenant-router/`
   - Setup: `node scripts/ensure-coordity-wildcard.mjs` then `cd tenant-router && npx wrangler deploy`

## Embeddable sign-in

- Live form: `https://{slug}.coordity.com/embed/sign-in`
- Snippet UI: `https://{slug}.coordity.com/embed`
