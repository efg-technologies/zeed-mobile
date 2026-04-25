// Short-word shortcut resolver. "google" → https://www.google.com.
//
// Strategy: prefer a hit from the user's own history / bookmarks / likes
// (because your shortcuts should reflect your own browsing), then fall back
// to a tiny hard-coded list of ubiquitous sites so new users don't have a
// cold-start problem.

export interface HostSource {
  url: string;
}

export interface ShortcutContext {
  bookmarks: HostSource[];
  likes: HostSource[];
  history: Array<HostSource & { visitCount?: number; lastVisited?: number }>;
}

const KNOWN: Record<string, string> = {
  google: 'https://www.google.com',
  youtube: 'https://www.youtube.com',
  twitter: 'https://twitter.com',
  x: 'https://x.com',
  github: 'https://github.com',
  reddit: 'https://www.reddit.com',
  wikipedia: 'https://www.wikipedia.org',
  amazon: 'https://www.amazon.co.jp',
  netflix: 'https://www.netflix.com',
  hn: 'https://news.ycombinator.com',
  hackernews: 'https://news.ycombinator.com',
  qiita: 'https://qiita.com',
  zenn: 'https://zenn.dev',
  notion: 'https://www.notion.so',
  chatgpt: 'https://chatgpt.com',
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com',
  openrouter: 'https://openrouter.ai',
  zeed: 'https://zeed.run',
};

/**
 * Resolve a short word to a full URL, if it looks like a site shortcut.
 * Returns null if the word is multi-word, contains non-word chars, or has no
 * plausible match.
 */
export function resolveShortcut(query: string, ctx: ShortcutContext): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  // Must be a single bare word: letters/digits/hyphen/underscore only.
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(q)) return null;
  // If the user typed a dot — let normalizeUrlOrSearch handle it.
  if (q.includes('.')) return null;

  const fromHistory = bestHostMatch(q, ctx.history, true);
  if (fromHistory) return fromHistory;

  const fromBookmarks = bestHostMatch(q, ctx.bookmarks, false);
  if (fromBookmarks) return fromBookmarks;

  const fromLikes = bestHostMatch(q, ctx.likes, false);
  if (fromLikes) return fromLikes;

  if (KNOWN[q]) return KNOWN[q];
  return null;
}

function bestHostMatch<T extends HostSource & { visitCount?: number; lastVisited?: number }>(
  q: string, list: T[], useVisitRank: boolean,
): string | null {
  type Scored = { url: string; score: number; tiebreak: number };
  const scored: Scored[] = [];
  for (const item of list) {
    const host = hostnameOf(item.url);
    if (!host) continue;
    const stripped = host.replace(/^www\./, '');
    let score = 0;
    if (stripped === q) score = 100;
    else if (stripped.startsWith(`${q}.`)) score = 80;
    else if (host === q) score = 95;
    else continue;
    const tiebreak = useVisitRank
      ? (item.visitCount ?? 0) * 1000 + (item.lastVisited ?? 0) / 1e9
      : 0;
    scored.push({ url: `https://${host}`, score, tiebreak });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.score - a.score) || (b.tiebreak - a.tiebreak));
  return scored[0]!.url;
}

function hostnameOf(u: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(u);
  return m?.[1]?.toLowerCase() ?? '';
}
