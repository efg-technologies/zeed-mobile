// Unified suggestion ranker for the omnibox.
// Priority (user-confirmed): direct URL → bookmarks → likes → history →
// (future: RSS-recommended) → Google search. Each source contributes up to
// a soft cap; dedupe by URL keeping the highest-priority source.

import type { Bookmark } from '../storage/bookmarks.ts';
import type { Like } from '../storage/likes.ts';
import type { HistoryEntry } from '../storage/history.ts';
import { searchHistory } from '../storage/history.ts';
import { normalizeUrlOrSearch } from '../webview/url.ts';

export type SuggestionSource =
  | 'direct'
  | 'bookmark'
  | 'like'
  | 'history'
  | 'google';

export interface Suggestion {
  source: SuggestionSource;
  url: string;
  title: string;
  // For google/direct: the raw query/text shown in the subtitle line.
  subtitle?: string;
}

export interface RankInput {
  query: string;
  bookmarks: Bookmark[];
  likes: Like[];
  history: HistoryEntry[];
  googleSuggestions: string[];
  limit?: number;
}

const SOURCE_PRIORITY: Record<SuggestionSource, number> = {
  direct: 0,
  bookmark: 1,
  like: 2,
  history: 3,
  google: 4,
};

export function rankSuggestions(input: RankInput): Suggestion[] {
  const q = input.query.trim();
  if (!q) return [];
  const limit = input.limit ?? 8;

  const out: Suggestion[] = [];

  // 1. Direct URL / search intent. Always offered as the top entry so
  //    pressing return is deterministic even mid-query.
  const normalized = normalizeUrlOrSearch(q);
  out.push({
    source: 'direct',
    url: normalized,
    title: looksLikeUrl(q) ? 'Go to site' : `Search Google for "${q}"`,
    subtitle: normalized,
  });

  // 2. Bookmarks (substring match on url / title).
  for (const b of filterByQuery(input.bookmarks, q)) {
    out.push({ source: 'bookmark', url: b.url, title: b.title, subtitle: b.url });
  }

  // 3. Likes.
  for (const l of filterByQuery(input.likes, q)) {
    out.push({ source: 'like', url: l.url, title: l.title, subtitle: l.url });
  }

  // 4. History — already ranked by its own scorer.
  for (const h of searchHistory(input.history, q, 6)) {
    out.push({ source: 'history', url: h.url, title: h.title, subtitle: h.url });
  }

  // 5. Google suggestions (opt-in; caller decides whether to populate).
  for (const s of input.googleSuggestions) {
    const u = `https://www.google.com/search?q=${encodeURIComponent(s)}`;
    out.push({ source: 'google', url: u, title: s, subtitle: 'Google search' });
  }

  return dedupe(out).slice(0, limit);
}

function filterByQuery<T extends { url: string; title: string }>(
  list: T[], q: string,
): T[] {
  const needle = q.toLowerCase();
  return list.filter(
    (x) => x.url.toLowerCase().includes(needle) || x.title.toLowerCase().includes(needle),
  );
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(s);
}

/**
 * Dedupe by URL, keeping the higher-priority source (lower priority number).
 * Preserves first-seen order within the winning priority.
 */
function dedupe(items: Suggestion[]): Suggestion[] {
  const best = new Map<string, Suggestion>();
  const order: string[] = [];
  for (const s of items) {
    const prev = best.get(s.url);
    if (!prev) {
      best.set(s.url, s);
      order.push(s.url);
    } else if (SOURCE_PRIORITY[s.source] < SOURCE_PRIORITY[prev.source]) {
      best.set(s.url, s);
    }
  }
  return order.map((u) => best.get(u)!);
}
