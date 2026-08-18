/**
 * Idempotent cutover helper for portal.wovensage.com.
 * Uses CLOUDFLARE_API_TOKEN (GitHub Actions) which typically has Zone DNS Edit.
 */
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '6b847212c32cfc59badb7935334d541a';
const PROJECT = 'wovensage-portal-preview';
const HOSTNAME = 'portal.wovensage.com';
const ZONE_NAME = 'wovensage.com';
const CNAME_TARGET = 'wovensage-portal-preview.pages.dev';
const PRODUCTION_BRANCH = 'master';

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('CLOUDFLARE_API_TOKEN is required');
  process.exit(1);
}

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
    throw error;
  }
  return body;
}

const zones = await cf(`/zones?name=${ZONE_NAME}`);
const zone = zones.result?.[0];
if (!zone?.id) {
  throw new Error(`Zone ${ZONE_NAME} not found`);
}

await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`, {
  method: 'PATCH',
  body: JSON.stringify({ production_branch: PRODUCTION_BRANCH }),
});
console.log(`Set ${PROJECT} production branch to ${PRODUCTION_BRANCH}`);

const domains = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`);
const hasDomain = (domains.result ?? []).some((domain) => domain.name === HOSTNAME);
if (!hasDomain) {
  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: HOSTNAME }),
  });
  console.log(`Attached ${HOSTNAME} to ${PROJECT}`);
} else {
  console.log(`${HOSTNAME} is already attached to ${PROJECT}`);
}

try {
  const records = await cf(`/zones/${zone.id}/dns_records?name=${HOSTNAME}`);
  const existing = (records.result ?? []).find(
    (record) => record.type === 'CNAME' || record.type === 'A' || record.type === 'AAAA',
  );

  if (!existing) {
    await cf(`/zones/${zone.id}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'CNAME',
        name: 'portal',
        content: CNAME_TARGET,
        proxied: true,
        ttl: 1,
        comment: 'Woven Sage employee portal',
      }),
    });
    console.log(`Created proxied CNAME ${HOSTNAME} -> ${CNAME_TARGET}`);
  } else if (existing.type === 'CNAME' && existing.content === CNAME_TARGET) {
    console.log(`DNS already points ${HOSTNAME} to ${existing.content}`);
  } else {
    console.log(
      `DNS for ${HOSTNAME} already exists as ${existing.type} ${existing.content}; leaving it unchanged`,
    );
  }
} catch (error) {
  const details = error instanceof Error ? error.details : undefined;
  console.warn(
    'Could not create DNS automatically. In Cloudflare DNS for wovensage.com, add a proxied CNAME: portal -> wovensage-portal-preview.pages.dev',
  );
  if (details) {
    console.warn(JSON.stringify(details));
  } else if (error instanceof Error) {
    console.warn(error.message);
  }
}
