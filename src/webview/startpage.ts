// Local 'new tab' start page. Rendered inside the WebView via source={{ html }}
// so regular <a href> navigation just drops into the tab's normal load flow.
// Design goal: Safari Start Page / Arc-ish — minimal chrome, surface the
// user's own bookmarks + recent history instead of any marketing page.

export interface StartPageItem {
  url: string;
  title: string;
}

/** Escape for safe inclusion inside HTML text / attribute values. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hostOf(u: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(u);
  return (m?.[1] ?? u).replace(/^www\./, '');
}

function card(item: StartPageItem): string {
  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostOf(item.url))}`;
  return `<a class="card" href="${escapeHtml(item.url)}">
    <img src="${escapeHtml(favicon)}" alt="" />
    <span class="title">${escapeHtml(item.title || hostOf(item.url))}</span>
    <span class="host">${escapeHtml(hostOf(item.url))}</span>
  </a>`;
}

export function buildStartPageHtml(opts: {
  bookmarks: StartPageItem[];
  recent: StartPageItem[];
  profileName?: string;
}): string {
  const bm = opts.bookmarks.slice(0, 8).map(card).join('');
  const rc = opts.recent.slice(0, 6).map(card).join('');
  const subtitle = opts.profileName
    ? `${escapeHtml(opts.profileName)} profile`
    : '';
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>New Tab</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin:0; padding:0; background:#0F0F12; color:#ddd;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased; }
  main { max-width: 720px; margin: 0 auto;
    padding: 56px 20px calc(24px + env(safe-area-inset-bottom)); }
  header { text-align: center; margin-bottom: 40px; }
  .logo { width: 72px; height: 72px; display: block; margin: 0 auto 12px; }
  .brand { font-size: 28px; font-weight: 700; letter-spacing: 0.5px; color: #fff; }
  .sub { font-size: 12px; color: #5B21B6; letter-spacing: 1.5px;
    text-transform: uppercase; margin-top: 6px; }
  h2 { color: #888; font-size: 11px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; margin: 28px 0 12px 4px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  @media (max-width: 420px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .list .card { flex-direction: row; align-items: center; gap: 12px;
    padding: 10px 12px; }
  .list .card img { width: 20px; height: 20px; }
  .list .card .title { font-size: 13px; }
  .list .card .host { display: none; }
  .card { display: flex; flex-direction: column; align-items: center;
    gap: 6px; padding: 14px 8px;
    background: #1A1A1F; border: 1px solid #2A2A30; border-radius: 12px;
    color: #ddd; text-decoration: none; }
  .card img { width: 32px; height: 32px; border-radius: 6px; background: #2A2A30; }
  .card .title { font-size: 12px; color: #fff; text-align: center;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 100%; }
  .card .host { font-size: 10px; color: #666; }
  .empty { color: #555; font-size: 12px; padding: 8px 4px; }
</style>
</head><body>
<main>
  <header>
    <svg class="logo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="Zeed">
      <rect width="64" height="64" rx="10" fill="#1A1A1F"/>
      <polygon points="14,14 50,14 14,40" fill="#b99aff"/>
      <polygon points="14,14 50,14 50,40" fill="#5B21B6" fill-opacity="0.4"/>
      <polygon points="14,50 50,24 50,50" fill="#b99aff"/>
      <polygon points="50,24 50,50 14,50" fill="#5B21B6" fill-opacity="0.55"/>
    </svg>
    <div class="brand">Zeed</div>
    <div class="sub">${subtitle || 'think with you'}</div>
  </header>

  ${opts.bookmarks.length
    ? `<h2>Bookmarks</h2><div class="grid">${bm}</div>`
    : ''}
  ${opts.recent.length
    ? `<h2>Recent</h2><div class="list">${rc}</div>`
    : ''}
  ${!opts.bookmarks.length && !opts.recent.length
    ? `<div class="empty">No bookmarks or history yet. Tap the URL bar to get started.</div>`
    : ''}
</main>
</body></html>`;
}

export const NEW_TAB_URL = 'about:newtab';
