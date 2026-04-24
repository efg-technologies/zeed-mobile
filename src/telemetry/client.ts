// Mobile telemetry client — Tier A only for now. Pure module: persistence,
// platform detection, fetch, and clock are injected so this unit-tests
// without RN.
//
// See plans/orion/telemetry.spec.md v3. Wire format matches zeed-browser so
// the existing Worker /v1/events endpoint + dashboard work unchanged.

import {
  ALLOWED_FEATURES, stripToAllowlist,
  type EndReason, type FeatureCode, type TierAEvent,
} from './allowlist.ts';

export const TELEMETRY_ENDPOINT =
  'https://zeed-telemetry.efg-technologies.workers.dev/v1/events';

export interface KvBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface TelemetryDeps {
  kv: KvBackend;
  fetch: typeof fetch;
  now: () => number;
  randomHex: (bytes: number) => string;
  version: string;   // digits + dots only (e.g. '0.1.0') — worker validates
  os: 'ios' | 'mac' | 'linux' | 'unknown';
  /** Tier A toggle. Default ON (matches browser). */
  tierAEnabled: () => boolean;
  logger?: {
    debug?: (m: string) => void;
    warn?: (m: string) => void;
  };
}

const K_INSTALL_ID = 'zeed.telemetry.install_id';
const K_INSTALL_SENT = 'zeed.telemetry.install_sent';
const K_LAST_HEARTBEAT = 'zeed.telemetry.last_heartbeat_date';

// ── Pure helpers ──────────────────────────────────────────────────────

export function dateStringFor(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export async function getOrCreateInstallId(
  kv: KvBackend, randomHex: (n: number) => string,
): Promise<string> {
  const existing = await kv.getItem(K_INSTALL_ID);
  if (existing && /^[a-f0-9]{16,64}$/i.test(existing)) return existing;
  const fresh = randomHex(16);
  await kv.setItem(K_INSTALL_ID, fresh);
  return fresh;
}

// ── Post + strip ──────────────────────────────────────────────────────

async function post(
  deps: TelemetryDeps,
  event: Record<string, unknown> & { event: TierAEvent },
): Promise<void> {
  if (!deps.tierAEnabled()) {
    deps.logger?.debug?.(`telemetry suppressed (opt-out): ${event.event}`);
    return;
  }
  const stripped = stripToAllowlist(event);
  // Worker expects a batch envelope { events: [...] }, matching the desktop
  // client. Single-event posts are rejected with 400 'bad request'.
  const body = JSON.stringify({ events: [stripped] });
  try {
    deps.logger?.debug?.(`telemetry → ${event.event}`);
    const r = await deps.fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!r.ok) deps.logger?.warn?.(`telemetry HTTP ${r.status} for ${event.event}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    deps.logger?.warn?.(`telemetry send failed (${event.event}): ${msg}`);
  }
}

// ── Public event helpers ──────────────────────────────────────────────

export async function sendInstallOnce(deps: TelemetryDeps): Promise<void> {
  const already = await deps.kv.getItem(K_INSTALL_SENT);
  if (already === '1') return;
  const installId = await getOrCreateInstallId(deps.kv, deps.randomHex);
  await post(deps, {
    event: 'install',
    install_id: installId,
    version: deps.version,
    os: deps.os,
  });
  await deps.kv.setItem(K_INSTALL_SENT, '1');
}

export async function sendSessionStart(deps: TelemetryDeps): Promise<void> {
  const installId = await getOrCreateInstallId(deps.kv, deps.randomHex);
  await post(deps, {
    event: 'session_start',
    install_id: installId,
    version: deps.version,
  });
}

export async function sendHeartbeatIfNewDay(deps: TelemetryDeps): Promise<void> {
  const today = dateStringFor(deps.now());
  const last = await deps.kv.getItem(K_LAST_HEARTBEAT);
  if (last === today) return;
  const installId = await getOrCreateInstallId(deps.kv, deps.randomHex);
  await post(deps, {
    event: 'heartbeat',
    install_id: installId,
    version: deps.version,
  });
  await deps.kv.setItem(K_LAST_HEARTBEAT, today);
}

export async function sendFeatureUsed(
  deps: TelemetryDeps, feature: FeatureCode,
): Promise<void> {
  if (!(ALLOWED_FEATURES as readonly string[]).includes(feature)) return;
  await post(deps, {
    event: 'feature_used',
    feature,
    version: deps.version,
  });
}

export async function sendAgentRun(
  deps: TelemetryDeps,
  info: { success: boolean; stepCount: number; endReason: EndReason },
): Promise<void> {
  await post(deps, {
    event: 'agent_run',
    success: info.success,
    step_count: Math.max(0, Math.min(info.stepCount, 50)),
    end_reason: info.endReason,
    version: deps.version,
  });
}
