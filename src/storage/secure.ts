// Secure storage abstraction. On-device only — never syncs to cloud.
// Backed by expo-secure-store (iOS Keychain / Android Keystore) in the app,
// but pure here so tests can inject a memory backend.
//
// Keys policy:
// - openrouter_api_key:   user's BYO OpenRouter key
// - autopilot_token:      bearer for Zeed Autopilot Worker (if user enabled Path B)
// - model_override:       optional model id
//
// Never log values. Never send to telemetry.

export interface SecureBackend {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const KEYS = {
  openrouterApiKey: 'openrouter_api_key',
  autopilotToken: 'autopilot_token',
  modelOverride: 'model_override',
} as const;

export type SecureKey = (typeof KEYS)[keyof typeof KEYS];

let backend: SecureBackend | null = null;

export function setSecureBackend(b: SecureBackend): void {
  backend = b;
}

function requireBackend(): SecureBackend {
  if (!backend) {
    throw new Error('secure backend not initialized — call setSecureBackend first');
  }
  return backend;
}

export async function getSecret(key: SecureKey): Promise<string | null> {
  const v = await requireBackend().getItemAsync(key);
  return v && v.length > 0 ? v : null;
}

export async function setSecret(key: SecureKey, value: string): Promise<void> {
  if (typeof value !== 'string') throw new Error('value must be a string');
  if (value.length === 0) {
    await requireBackend().deleteItemAsync(key);
    return;
  }
  await requireBackend().setItemAsync(key, value);
}

export async function clearSecret(key: SecureKey): Promise<void> {
  await requireBackend().deleteItemAsync(key);
}

/** In-memory backend for tests. Not for production. */
export function createMemoryBackend(): SecureBackend {
  const m = new Map<string, string>();
  return {
    async getItemAsync(k) {
      return m.get(k) ?? null;
    },
    async setItemAsync(k, v) {
      m.set(k, v);
    },
    async deleteItemAsync(k) {
      m.delete(k);
    },
  };
}
