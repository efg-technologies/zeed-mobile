// Client for the Zeed Autopilot Worker (Manus-style cloud VM bridge).
// Sends a task description, receives intermediate status via SSE-like
// polling, finally gets { ok, summary, artifacts }.
//
// Privacy contract (docs/autopilot-privacy.md):
// - Persistent user data (Memory / Tasks / Bookmarks) NEVER leaves phone.
// - Only the user's task description + any URLs explicitly pasted by user
//   are sent.
// - The VM session is ephemeral (destroyed on task completion).
// - Intermediate screenshots / DOM dumps stay in VM, are not persisted.
// - Only final `summary` + user-chosen `artifacts` come back.

export interface AutopilotTaskInput {
  /** Natural-language task from user */
  goal: string;
  /** Optional starting URL */
  startUrl?: string;
  /** Optional constraints (max steps, max duration, allow_login) */
  constraints?: {
    maxSteps?: number;
    maxSeconds?: number;
    allowLogin?: boolean;
  };
}

export interface AutopilotRun {
  runId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: number;
  endedAt?: number;
}

export interface AutopilotResult {
  ok: boolean;
  runId: string;
  summary: string;
  /** Structured facts extracted from the run, meant to flow into Memory */
  facts: Array<{ text: string; sourceUrl?: string }>;
  /** Screenshots opt-in by user — base64 data URLs, capped */
  screenshots?: string[];
  error?: string;
}

export interface AutopilotClientOptions {
  endpoint: string;
  bearerToken: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const DEFAULT_MAX_STEPS = 30;
const DEFAULT_MAX_SECONDS = 180;

export async function startRun(
  input: AutopilotTaskInput,
  opts: AutopilotClientOptions,
): Promise<{ runId: string; error: string | null }> {
  if (!input.goal || input.goal.trim().length < 3) {
    return { runId: '', error: 'goal must be at least 3 chars' };
  }
  const body = {
    goal: input.goal.trim(),
    startUrl: input.startUrl,
    constraints: {
      maxSteps: input.constraints?.maxSteps ?? DEFAULT_MAX_STEPS,
      maxSeconds: input.constraints?.maxSeconds ?? DEFAULT_MAX_SECONDS,
      allowLogin: input.constraints?.allowLogin ?? false,
    },
  };
  const f = opts.fetchImpl ?? fetch;
  let resp: Response;
  try {
    resp = await f(`${opts.endpoint}/v1/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.bearerToken}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    return { runId: '', error: `network: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!resp.ok) {
    return { runId: '', error: `HTTP ${resp.status}` };
  }
  const json = (await resp.json().catch(() => null)) as { runId?: string } | null;
  if (!json || typeof json.runId !== 'string') {
    return { runId: '', error: 'missing runId in response' };
  }
  return { runId: json.runId, error: null };
}

export async function getRun(
  runId: string,
  opts: AutopilotClientOptions,
): Promise<AutopilotRun | { error: string }> {
  const f = opts.fetchImpl ?? fetch;
  let resp: Response;
  try {
    resp = await f(`${opts.endpoint}/v1/runs/${encodeURIComponent(runId)}`, {
      headers: { Authorization: `Bearer ${opts.bearerToken}` },
      signal: opts.signal,
    });
  } catch (e) {
    return { error: `network: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!resp.ok) return { error: `HTTP ${resp.status}` };
  return (await resp.json()) as AutopilotRun;
}

export async function getResult(
  runId: string,
  opts: AutopilotClientOptions,
): Promise<AutopilotResult> {
  const f = opts.fetchImpl ?? fetch;
  let resp: Response;
  try {
    resp = await f(`${opts.endpoint}/v1/runs/${encodeURIComponent(runId)}/result`, {
      headers: { Authorization: `Bearer ${opts.bearerToken}` },
      signal: opts.signal,
    });
  } catch (e) {
    return {
      ok: false, runId, summary: '', facts: [],
      error: `network: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!resp.ok) {
    return { ok: false, runId, summary: '', facts: [], error: `HTTP ${resp.status}` };
  }
  return (await resp.json()) as AutopilotResult;
}

export async function cancelRun(
  runId: string,
  opts: AutopilotClientOptions,
): Promise<boolean> {
  const f = opts.fetchImpl ?? fetch;
  try {
    const resp = await f(`${opts.endpoint}/v1/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.bearerToken}` },
      signal: opts.signal,
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Poll `getRun` until status is terminal or deadline reached. */
export async function waitForCompletion(
  runId: string,
  opts: AutopilotClientOptions & {
    pollMs?: number;
    deadlineMs?: number;
    onProgress?: (r: AutopilotRun) => void;
  },
): Promise<AutopilotResult> {
  const pollMs = opts.pollMs ?? 2000;
  const deadline = Date.now() + (opts.deadlineMs ?? DEFAULT_MAX_SECONDS * 1000);
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) {
      return { ok: false, runId, summary: '', facts: [], error: 'aborted' };
    }
    const run = await getRun(runId, opts);
    if ('error' in run) {
      return { ok: false, runId, summary: '', facts: [], error: run.error };
    }
    opts.onProgress?.(run);
    if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
      return await getResult(runId, opts);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { ok: false, runId, summary: '', facts: [], error: 'deadline exceeded' };
}
