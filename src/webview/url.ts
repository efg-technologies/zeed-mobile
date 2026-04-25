// URL bar input normalization.
// - full URL with scheme  → keep as-is
// - domain-ish (no space, has .tld)  → prepend https://
// - everything else  → Google search query

const DOMAIN_RE = /^[^\s]+\.[a-z]{2,}(\/.*)?$/i;

export function normalizeUrlOrSearch(raw: string): string {
  const s = raw.trim();
  if (!s) return 'about:blank';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^about:/i.test(s)) return s;
  if (DOMAIN_RE.test(s) && !/\s/.test(s)) return `https://${s}`;
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}
