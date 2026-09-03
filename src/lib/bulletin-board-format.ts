const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Escape text and turn http(s)/www URLs into clickable links. */
export function linkifyHtml(value: string): string {
  const escaped = escapeHtml(value);
  return escaped.replace(URL_RE, (raw) => {
    let url = raw;
    let trailing = '';
    while (/[.,!?);:\]]$/.test(url)) {
      trailing = `${url.slice(-1)}${trailing}`;
      url = url.slice(0, -1);
    }
    if (!url) return raw;
    const href = url.startsWith('http') ? url : `https://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  });
}

export const BOARD_ZOOM_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.25" stroke="currentColor" stroke-width="1.75"/><path d="M15.5 15.5L20 20" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
