// Mobile-side model of the Profile > TabGroup > Tab hierarchy.
// See plans/orion/spec.md §5 — Profile is a HARD boundary (memory /
// tasks / chat never cross), TabGroup is a SOFT boundary (AI prefers
// within-group context but can cross with explicit intent).

export interface Profile {
  id: string;
  name: string;
  /** Hard private flag. While active: no history, no telemetry,
   * WebView incognito, AI (Ask / research) disabled. Exiting the
   * profile wipes all ephemeral state created within it. */
  private: boolean;
  color: string;
}

export interface TabGroup {
  id: string;
  profileId: string;
  name: string;
  color: string;
}

export const DEFAULT_PROFILES: Profile[] = [
  { id: 'personal', name: 'Personal', private: false, color: '#5B21B6' },
  { id: 'private',  name: 'Private',  private: true,  color: '#b99aff' },
];

export const DEFAULT_GROUP_ID = 'default';

export function defaultGroupFor(profileId: string): TabGroup {
  return {
    id: `${profileId}:${DEFAULT_GROUP_ID}`,
    profileId,
    name: 'Default',
    color: '#2A2A30',
  };
}
