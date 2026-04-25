// Agent loop orchestrator (Path A: on-device local JS injection).
//
// observe → reason (OpenRouter) → act (bridge JS) → repeat.
// Side effects are injected so this module is testable without React Native.
//
// Path B (cloud VM autopilot) is a separate module — see src/autopilot/client.ts.
// This loop decides when to fall back: if local execution hits too many dead
// ends (e.g. CAPTCHA, login wall, JS-opaque SPA), it emits a `needs_autopilot`
// action which the UI can surface as an opt-in upgrade.

import type { ChatMessage } from '../llm/openrouter.ts';

export interface AgentAction {
  tool: 'click_by_label' | 'click_by_selector' | 'read_page' | 'navigate' | 'research' | 'finish' | 'needs_autopilot';
  label?: string;
  role?: string;
  selector?: string;
  url?: string;
  interactiveOnly?: boolean;
  query?: string;
  summary?: string;
  reason?: string;
}

export interface PageObservation {
  url: string;
  title: string;
  text: string;
  interactives: Array<{ ref: string; role: string; label: string }>;
}

export interface AgentDeps {
  observe: () => Promise<PageObservation>;
  act: (action: AgentAction) => Promise<{ ok: boolean; error?: string }>;
  reason: (messages: ChatMessage[]) => Promise<{ response: string; error: string | null }>;
  /** Knowledge lookup without browsing; used for the 'research' tool.
   * Implementations typically wire this to a web-search-grounded model. */
  research?: (query: string) => Promise<{ result: string; error: string | null }>;
  onStep?: (step: AgentStep) => void;
  signal?: AbortSignal;
}

export interface AgentStep {
  index: number;
  observation: PageObservation;
  action: AgentAction;
  actResult: { ok: boolean; error?: string };
}

export interface AgentRunResult {
  ok: boolean;
  summary: string;
  steps: AgentStep[];
  error?: string;
  suggestAutopilot?: boolean;
}

export const SYSTEM_PROMPT = `You are Zeed, an AI that helps a user accomplish a task inside a mobile WebView.
Each turn you reply with exactly one JSON action.

Available tools:
- {"tool":"research","query":"<question>"}           — knowledge lookup, no browsing
- {"tool":"navigate","url":"<https url>"}
- {"tool":"read_page","interactiveOnly":true|false}
- {"tool":"click_by_label","label":"<text>","role":"button|link|"}
- {"tool":"click_by_selector","selector":"<css>"}
- {"tool":"finish","summary":"<what you did or concluded>"}
- {"tool":"needs_autopilot","reason":"<why local failed>"}

How to think before acting:
- The user's literal words are not always the task. If the goal contains
  subjective or evaluative terms ("best", "top", "good", "recommended",
  "cheapest while still good", etc.), the user is trusting your judgment.
  A blind keyword search is almost always the wrong first move.
- For such goals: first research (the research tool uses a web-search
  grounded model) to build criteria or a candidate set. Summarise what
  you learned. Only then navigate to a specific page or query.
- For concrete goals ("open github.com", "search X on amazon.co.jp for
  the brand Y"), act directly — no need to research what you already know.
- If after research you still need the user to choose between candidates,
  finish with a summary that lists the options rather than picking for
  them. Respect their agency.

Output rules:
- Reply with ONLY a single JSON object, no prose outside the JSON.
- Prefer click_by_label over click_by_selector.
- Emit needs_autopilot only after 2+ failed local attempts at the same
  sub-goal.
- finish.summary is shown to the user and may use GitHub-flavored
  Markdown (headings, lists, **bold**, links, code). If entity
  relationships are genuinely the point, include:
      \`\`\`zeed-graph
      {"nodes":[{"id":"a","label":"X"}],"edges":[{"from":"a","to":"b","label":"rel"}]}
      \`\`\`
  Use graphs sparingly — only when the relationships are the payload,
  not decoration.`;

const MAX_STEPS = 20;
const MAX_CONSECUTIVE_FAILURES = 3;

export function parseAction(raw: string): AgentAction | { error: string } {
  const trimmed = raw.trim();
  // Permit wrapping fences
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  let obj: unknown;
  try {
    obj = JSON.parse(stripped);
  } catch (e) {
    return { error: `invalid json: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!obj || typeof obj !== 'object') return { error: 'action must be object' };
  const a = obj as Record<string, unknown>;
  const tool = a['tool'];
  if (typeof tool !== 'string') return { error: 'missing tool' };
  const known = [
    'click_by_label', 'click_by_selector', 'read_page',
    'navigate', 'research', 'finish', 'needs_autopilot',
  ];
  if (!known.includes(tool)) return { error: `unknown tool: ${tool}` };
  return obj as AgentAction;
}

export function observationToText(obs: PageObservation, maxChars = 4000): string {
  const header = `URL: ${obs.url}\nTITLE: ${obs.title}\n`;
  const interactives = obs.interactives
    .slice(0, 40)
    .map((x) => `[${x.ref}] ${x.role}: ${x.label}`)
    .join('\n');
  const text = obs.text.slice(0, maxChars - header.length - interactives.length - 20);
  return `${header}INTERACTIVES:\n${interactives}\n\nTEXT:\n${text}`;
}

export async function runAgent(
  goal: string,
  deps: AgentDeps,
  opts: { maxSteps?: number } = {},
): Promise<AgentRunResult> {
  if (!goal || goal.trim().length < 3) {
    return { ok: false, summary: '', steps: [], error: 'goal must be at least 3 chars' };
  }
  const maxSteps = Math.max(1, Math.min(opts.maxSteps ?? MAX_STEPS, MAX_STEPS));
  const steps: AgentStep[] = [];
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Goal: ${goal.trim()}` },
  ];
  let consecutiveFailures = 0;

  for (let i = 0; i < maxSteps; i++) {
    if (deps.signal?.aborted) {
      return { ok: false, summary: '', steps, error: 'aborted' };
    }
    let observation: PageObservation;
    try {
      observation = await deps.observe();
    } catch (e) {
      return {
        ok: false, summary: '', steps,
        error: `observe failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    messages.push({ role: 'user', content: observationToText(observation) });

    const { response, error } = await deps.reason(messages);
    if (error) return { ok: false, summary: '', steps, error: `reason: ${error}` };
    messages.push({ role: 'assistant', content: response });

    const parsed = parseAction(response);
    if ('error' in parsed) {
      return { ok: false, summary: '', steps, error: `parse: ${parsed.error}` };
    }
    const action = parsed;

    if (action.tool === 'finish') {
      const step: AgentStep = { index: i, observation, action, actResult: { ok: true } };
      steps.push(step);
      deps.onStep?.(step);
      return { ok: true, summary: action.summary ?? '', steps };
    }
    if (action.tool === 'needs_autopilot') {
      const step: AgentStep = { index: i, observation, action, actResult: { ok: true } };
      steps.push(step);
      deps.onStep?.(step);
      return {
        ok: false, summary: '', steps,
        error: action.reason ?? 'local agent stuck',
        suggestAutopilot: true,
      };
    }

    if (action.tool === 'research') {
      if (!deps.research) {
        const step: AgentStep = {
          index: i, observation, action,
          actResult: { ok: false, error: 'research tool not wired' },
        };
        steps.push(step);
        deps.onStep?.(step);
        messages.push({
          role: 'user',
          content: 'Research is not available in this build. Proceed without it.',
        });
        continue;
      }
      const q = (action.query ?? '').trim();
      if (!q) {
        messages.push({ role: 'user', content: 'research: query was empty. Try again.' });
        continue;
      }
      const { result, error } = await deps.research(q);
      const step: AgentStep = {
        index: i, observation, action,
        actResult: error ? { ok: false, error } : { ok: true },
      };
      steps.push(step);
      deps.onStep?.(step);
      if (error) {
        messages.push({ role: 'user', content: `research failed: ${error}` });
      } else {
        messages.push({
          role: 'user',
          content: `Research result for "${q}":\n${result.slice(0, 4000)}`,
        });
      }
      continue;
    }

    const actResult = await deps.act(action);
    const step: AgentStep = { index: i, observation, action, actResult };
    steps.push(step);
    deps.onStep?.(step);

    if (!actResult.ok) {
      consecutiveFailures++;
      messages.push({
        role: 'user',
        content: `Action failed: ${actResult.error ?? 'unknown'}. Try a different approach.`,
      });
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        return {
          ok: false, summary: '', steps,
          error: `${MAX_CONSECUTIVE_FAILURES} consecutive failures`,
          suggestAutopilot: true,
        };
      }
    } else {
      consecutiveFailures = 0;
    }
  }
  return { ok: false, summary: '', steps, error: 'max steps exceeded', suggestAutopilot: true };
}
