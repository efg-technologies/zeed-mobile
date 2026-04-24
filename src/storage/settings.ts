// App settings — non-secret preferences persisted in AsyncStorage.
// Secrets (API keys) stay in Keychain via src/storage/secure.ts.

export interface Settings {
  googleSuggestEnabled: boolean;
  telemetryAggregateEnabled: boolean;
}

export interface KvBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const KEY = 'zeed.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  googleSuggestEnabled: false,
  telemetryAggregateEnabled: true,
};

export async function loadSettings(kv: KvBackend): Promise<Settings> {
  const raw = await kv.getItem(KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(kv: KvBackend, s: Settings): Promise<void> {
  await kv.setItem(KEY, JSON.stringify(s));
}

export function normalize(input: unknown): Settings {
  const base = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object') return base;
  const v = input as Record<string, unknown>;
  if (typeof v.googleSuggestEnabled === 'boolean') {
    base.googleSuggestEnabled = v.googleSuggestEnabled;
  }
  if (typeof v.telemetryAggregateEnabled === 'boolean') {
    base.telemetryAggregateEnabled = v.telemetryAggregateEnabled;
  }
  return base;
}
