// Likes — lightweight preference signal. Separate store from bookmarks so
// users can "like" a lot without cluttering their bookmark list. Same
// on-device-only KV contract.

export interface Like {
  url: string;
  title: string;
  addedAt: number;
}

export interface KvBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const KEY = 'zeed.likes.v1';

export async function loadLikes(kv: KvBackend): Promise<Like[]> {
  const raw = await kv.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLike);
  } catch {
    return [];
  }
}

export async function saveLikes(kv: KvBackend, list: Like[]): Promise<void> {
  await kv.setItem(KEY, JSON.stringify(list));
}

export function isLiked(list: Like[], url: string): boolean {
  return list.some((l) => l.url === url);
}

export function addLike(list: Like[], url: string, title: string, now: number): Like[] {
  if (isLiked(list, url)) return list;
  return [{ url, title, addedAt: now }, ...list];
}

export function removeLike(list: Like[], url: string): Like[] {
  return list.filter((l) => l.url !== url);
}

export function toggleLike(
  list: Like[], url: string, title: string, now: number,
): Like[] {
  return isLiked(list, url)
    ? removeLike(list, url)
    : addLike(list, url, title, now);
}

function isLike(x: unknown): x is Like {
  return !!x && typeof x === 'object'
    && typeof (x as Like).url === 'string'
    && typeof (x as Like).title === 'string'
    && typeof (x as Like).addedAt === 'number';
}
