// Google search suggestion fetcher (unofficial endpoint).
// Opt-in only: each keystroke sent to Google when enabled.
// Response shape: ["query", ["sugg1", "sugg2", ...], ...]

const ENDPOINT = 'https://suggestqueries.google.com/complete/search';

export interface FetchLike {
  (input: string, init?: { signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

export async function fetchGoogleSuggestions(
  query: string,
  opts: { fetch?: FetchLike; signal?: AbortSignal } = {},
): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const f = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const url = `${ENDPOINT}?client=firefox&q=${encodeURIComponent(q)}`;
  try {
    const res = await f(url, { signal: opts.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return parseSuggestions(data);
  } catch {
    return [];
  }
}

export function parseSuggestions(data: unknown): string[] {
  if (!Array.isArray(data) || data.length < 2) return [];
  const arr = data[1];
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string').slice(0, 10);
}
