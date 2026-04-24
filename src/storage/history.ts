// Visit history — on-device only. Pure over a KV backend so we can test
// without AsyncStorage.

export interface HistoryEntry {
  url: string;
  title: string;
  visitCount: number;
  lastVisited: number;
}

export interface KvBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const KEY = 'zeed.history.v1';
const MAX_ENTRIES = 1000;

export async function loadHistory(kv: KvBackend): Promise<HistoryEntry[]> {
  const raw = await kv.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

export async function saveHistory(kv: KvBackend, list: HistoryEntry[]): Promise<void> {
  await kv.setItem(KEY, JSON.stringify(list));
}

export function recordVisit(
  list: HistoryEntry[], url: string, title: string, now: number,
): HistoryEntry[] {
  if (!url || /^about:/i.test(url)) return list;
  const idx = list.findIndex((e) => e.url === url);
  let next: HistoryEntry[];
  if (idx >= 0) {
    const prev = list[idx]!;
    const updated: HistoryEntry = {
      url,
      title: title || prev.title,
      visitCount: prev.visitCount + 1,
      lastVisited: now,
    };
    next = [updated, ...list.slice(0, idx), ...list.slice(idx + 1)];
  } else {
    next = [{ url, title: title || url, visitCount: 1, lastVisited: now }, ...list];
  }
  return next.slice(0, MAX_ENTRIES);
}

/**
 * Case-insensitive substring match on url and title. Ranks prefix matches on
 * host/title above generic substring matches, then falls back to recency and
 * visit count. Returns up to `limit` entries.
 */
export function searchHistory(
  list: HistoryEntry[], query: string, limit = 8,
): HistoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  type Scored = { e: HistoryEntry; score: number };
  const scored: Scored[] = [];
  for (const e of list) {
    const url = e.url.toLowerCase();
    const title = e.title.toLowerCase();
    if (!url.includes(q) && !title.includes(q)) continue;
    let score = 0;
    const host = hostOf(url);
    if (host.startsWith(q)) score += 100;
    if (title.startsWith(q)) score += 80;
    if (url.includes(q)) score += 10;
    if (title.includes(q)) score += 5;
    score += Math.min(e.visitCount, 20);
    scored.push({ e, score });
  }
  scored.sort((a, b) => (b.score - a.score) || (b.e.lastVisited - a.e.lastVisited));
  return scored.slice(0, limit).map((s) => s.e);
}

function hostOf(url: string): string {
  const m = /^https?:\/\/([^/]+)/i.exec(url);
  return m?.[1]?.toLowerCase() ?? '';
}

function isEntry(x: unknown): x is HistoryEntry {
  return !!x && typeof x === 'object'
    && typeof (x as HistoryEntry).url === 'string'
    && typeof (x as HistoryEntry).title === 'string'
    && typeof (x as HistoryEntry).visitCount === 'number'
    && typeof (x as HistoryEntry).lastVisited === 'number';
}
