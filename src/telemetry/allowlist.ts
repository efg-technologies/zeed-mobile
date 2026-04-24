// Mobile telemetry allowlist — mirrors the Tier A subset of
// zeed-browser/.../telemetry/allowlist.ts. Keep in sync with
// plans/orion/telemetry.spec.md v3.
//
// Tier A (default ON): install, session_start, heartbeat, feature_used,
//                      agent_run.
// Tier C (never): anything not in ALLOWED_FIELDS below.

export type TierAEvent =
  | 'install' | 'session_start' | 'heartbeat' | 'feature_used' | 'agent_run';

export const ALLOWED_FIELDS: Record<TierAEvent, readonly string[]> = {
  install:       ['event', 'install_id', 'version', 'os'],
  session_start: ['event', 'install_id', 'version'],
  heartbeat:     ['event', 'install_id', 'version'],
  feature_used:  ['event', 'feature', 'version'],
  agent_run:     ['event', 'success', 'step_count', 'end_reason', 'version'],
} as const;

export const ALLOWED_FEATURES = [
  'bookmark_add', 'bookmark_remove',
  'like_add', 'like_remove',
  'tab_new', 'tab_close',
  'mode_auto', 'mode_ask', 'mode_search',
  'share', 'history_cleared', 'settings_opened',
] as const;
export type FeatureCode = typeof ALLOWED_FEATURES[number];

export const ALLOWED_END_REASONS = [
  'finish', 'needs_autopilot', 'max_steps', 'failure_cap',
  'parse_error', 'reason_error', 'observe_error', 'aborted', 'error',
] as const;
export type EndReason = typeof ALLOWED_END_REASONS[number];

/**
 * Strip an event object down to its allowed fields. Unknown fields are
 * dropped so a bug in the caller can never exfiltrate anything sensitive.
 */
export function stripToAllowlist<T extends { event: TierAEvent }>(
  raw: T,
): Record<string, unknown> {
  const allowed = ALLOWED_FIELDS[raw.event];
  if (!allowed) return { event: raw.event };
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = (raw as Record<string, unknown>)[key];
    }
  }
  return out;
}
