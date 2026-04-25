// Bookmarks — persistent list of {url, title, addedAt}, stored on-device only.
// Pure over a KV backend so we can unit-test without AsyncStorage.

export interface Bookmark {
  url: string;
  title: string;
  addedAt: number;
}

export interface KvBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const KEY = 'zeed.bookmarks.v1';

export async function loadBookmarks(kv: KvBackend): Promise<Bookmark[]> {
  const raw = await kv.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBookmark);
  } catch {
    return [];
  }
}

export async function saveBookmarks(kv: KvBackend, list: Bookmark[]): Promise<void> {
  await kv.setItem(KEY, JSON.stringify(list));
}

export function isBookmarked(list: Bookmark[], url: string): boolean {
  return list.some((b) => b.url === url);
}

export function addBookmark(list: Bookmark[], url: string, title: string, now: number): Bookmark[] {
  if (isBookmarked(list, url)) return list;
  return [{ url, title, addedAt: now }, ...list];
}

export function removeBookmark(list: Bookmark[], url: string): Bookmark[] {
  return list.filter((b) => b.url !== url);
}

export function toggleBookmark(
  list: Bookmark[], url: string, title: string, now: number,
): Bookmark[] {
  return isBookmarked(list, url)
    ? removeBookmark(list, url)
    : addBookmark(list, url, title, now);
}

function isBookmark(x: unknown): x is Bookmark {
  return !!x && typeof x === 'object'
    && typeof (x as Bookmark).url === 'string'
    && typeof (x as Bookmark).title === 'string'
    && typeof (x as Bookmark).addedAt === 'number';
}
