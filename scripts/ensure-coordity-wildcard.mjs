/**
 * Attach wildcard DNS for Coordity tenants and ensure the tenant-router Worker route exists.
 * Uses Wrangler OAuth credentials from the local wrangler login.
 *
 * Pages cannot bind *.coordity.com directly; DNS * + Worker route proxies to Pages.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '6b847212c32cfc59badb7935334d541a';
const ZONE_NAME = 'coordity.com';
const CNAME_TARGET = 'wovensage-portal-preview.pages.dev';
const WILDCARD_NAME = '*';
const WILDCARD_FQDN = '*.coordity.com';

function loadWranglerOauthToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const configPath = join(homedir(), 'Library/Preferences/.wrangler/config/default.toml');
  const raw = readFileSync(configPath, 'utf8');
  const match = raw.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!match) throw new Error('No Wrangler OAuth token found. Run: npx wrangler login');
  return match[1];
}

const token = loadWranglerOauthToken();

async function cf(path, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok || body.success === false) {
    const error = new Error(`Cloudflare API ${res.status} ${path}`);
    error.details = body.errors ?? body;
    error.status = res.status;
    throw error;
  }
  return body;
}

const zones = await cf(`/zones?name=${ZONE_NAME}`);
const zone = zones.result?.[0];
if (!zone?.id) throw new Error(`Zone ${ZONE_NAME} not found in this account`);

console.log(`Zone ${ZONE_NAME} = ${zone.id}`);

// Wildcard DNS (proxied) so Worker routes can intercept tenant hosts.
try {
  const records = await cf(
    `/zones/${zone.id}/dns_records?type=CNAME&name=${encodeURIComponent(WILDCARD_FQDN)}`,
  );
  const existing = (records.result ?? [])[0];
  if (!existing) {
    await cf(`/zones/${zone.id}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'CNAME',
        name: WILDCARD_NAME,
        content: CNAME_TARGET,
        proxied: true,
        ttl: 1,
        comment: 'Coordity tenant wildcard → Pages (via Worker route)',
      }),
    });
    console.log(`Created proxied CNAME ${WILDCARD_FQDN} -> ${CNAME_TARGET}`);
  } else if (existing.content === CNAME_TARGET && existing.proxied) {
    console.log(`DNS already points ${WILDCARD_FQDN} to ${existing.content} (proxied)`);
  } else {
    await cf(`/zones/${zone.id}/dns_records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: 'CNAME',
        name: WILDCARD_NAME,
        content: CNAME_TARGET,
        proxied: true,
        ttl: 1,
        comment: 'Coordity tenant wildcard → Pages (via Worker route)',
      }),
    });
    console.log(`Updated ${WILDCARD_FQDN} → ${CNAME_TARGET} (proxied)`);
  }
} catch (error) {
  console.warn('Could not write wildcard DNS automatically (token may lack Zone DNS Edit).');
  console.warn(
    `In Cloudflare DNS for ${ZONE_NAME}, add proxied CNAME: * → ${CNAME_TARGET}`,
  );
  if (error instanceof Error) {
    console.warn(error.message);
    if (error.details) console.warn(JSON.stringify(error.details));
  }
}

console.log(`Account ${ACCOUNT_ID}: deploy tenant-router Worker next (wrangler deploy).`);
