import { nowMs } from './crypto';
import { getEnv } from './env';

export const QUICK_LINK_ICON_MAX_BYTES = 500_000;

const QUICK_LINK_ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function quickLinkIconPath(linkId: string, version: number): string {
  return `/api/quick-links/icon/${encodeURIComponent(linkId)}?v=${version}`;
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function assertPublicUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Icon address must be http(s).');
  }
  if (url.username || url.password || isBlockedHost(url.hostname)) {
    throw new Error('That website cannot be used for an icon.');
  }
  return url.toString();
}

async function fetchPublic(start: string, accept: string): Promise<Response> {
  let current = assertPublicUrl(start);
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      headers: { Accept: accept, 'User-Agent': 'CoordityQuickLinkIcon/1.0' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirect had no destination.');
      current = assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    return response;
  }
  throw new Error('Too many redirects.');
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, merged.byteLength - offset);
    if (take <= 0) break;
    merged.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder().decode(merged);
}

function extractIconUrls(html: string, pageUrl: string): string[] {
  const found: { score: number; href: string }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (/ \brel\s*=\s*["']([^"']+)["']/i.exec(` ${tag}`)?.[1] ?? '').toLowerCase();
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim() ?? '';
    if (!href || !rel.includes('icon') || rel.includes('stylesheet')) continue;
    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).toString();
      assertPublicUrl(absolute);
    } catch {
      continue;
    }
    const score = rel.includes('apple-touch-icon') ? 3 : absolute.includes('.png') ? 2 : 1;
    found.push({ score, href: absolute });
  }
  found.sort((a, b) => b.score - a.score);
  return found.map((item) => item.href);
}

async function fallbackFavicon(pageUrl: string): Promise<string | null> {
  const icon = new URL('/favicon.ico', pageUrl).toString();
  const response = await fetchPublic(icon, 'image/*');
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  await response.body?.cancel();
  if (!response.ok) return null;
  if (type.startsWith('image/') || type.includes('icon')) return icon;
  return null;
}

/** Best public icon URL for a website, or null when none can be found. */
export async function discoverSiteIcon(pageUrl: string): Promise<string | null> {
  try {
    const page = assertPublicUrl(pageUrl);
    const response = await fetchPublic(page, 'text/html,application/xhtml+xml');
    if (!response.ok) return await fallbackFavicon(page);
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!type.includes('html') && !type.includes('xml')) {
      await response.body?.cancel();
      return await fallbackFavicon(page);
    }
    const html = await readLimitedText(response, 80_000);
    const icons = extractIconUrls(html, page);
    if (icons[0]) return icons[0];
    return await fallbackFavicon(page);
  } catch {
    return null;
  }
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function readQuickLinkIconFile(file: FormDataEntryValue | null): Promise<{
  mime: string;
  data: string;
} | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const mime = file.type || 'image/png';
  if (!QUICK_LINK_ICON_TYPES.has(mime)) {
    throw new Error('Use a PNG, JPEG, WebP, or GIF image.');
  }
  if (file.size > QUICK_LINK_ICON_MAX_BYTES) {
    throw new Error('Image is too large (max 500KB).');
  }
  return { mime, data: await fileToBase64(file) };
}

function iconStoreError(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (message.toLowerCase().includes('no such table')) {
    throw new Error('Image upload is not ready yet. Save without an image to use the website icon, then try again in a minute.');
  }
  throw error instanceof Error ? error : new Error('Could not save the image.');
}

export async function storeQuickLinkIcon(
  orgId: string,
  linkId: string,
  file: { mime: string; data: string },
): Promise<number> {
  const { DB } = getEnv();
  const owned = await DB.prepare(`SELECT id FROM portal_quick_link WHERE id = ? AND org_id = ?`)
    .bind(linkId, orgId)
    .first<{ id: string }>();
  if (!owned) throw new Error('Quick link not found.');
  const updatedAt = nowMs();
  try {
    await DB.prepare(
      `INSERT INTO portal_quick_link_icon (link_id, mime, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(link_id) DO UPDATE SET
         mime = excluded.mime,
         data = excluded.data,
         updated_at = excluded.updated_at`,
    )
      .bind(linkId, file.mime, file.data, updatedAt)
      .run();
  } catch (error) {
    iconStoreError(error);
  }
  return updatedAt;
}

export async function clearQuickLinkIcon(orgId: string, linkId: string): Promise<void> {
  const { DB } = getEnv();
  try {
    await DB.prepare(
      `DELETE FROM portal_quick_link_icon
       WHERE link_id = ?
         AND link_id IN (SELECT id FROM portal_quick_link WHERE id = ? AND org_id = ?)`,
    )
      .bind(linkId, linkId, orgId)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('no such table')) return;
    throw error;
  }
}

export async function getQuickLinkIcon(
  orgId: string,
  linkId: string,
): Promise<{ mime: string; dataBase64: string; updatedAt: number } | null> {
  const { DB } = getEnv();
  try {
    return await DB.prepare(
      `SELECT i.mime AS mime, i.data AS dataBase64, i.updated_at AS updatedAt
       FROM portal_quick_link_icon i
       JOIN portal_quick_link l ON l.id = i.link_id
       WHERE i.link_id = ? AND l.org_id = ?`,
    )
      .bind(linkId, orgId)
      .first<{ mime: string; dataBase64: string; updatedAt: number }>();
  } catch {
    return null;
  }
}
