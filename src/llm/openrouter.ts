// Thin OpenRouter client — pure, RN-agnostic (uses fetch which RN has).
// The HTTP layer is injectable for tests.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  webSearch?: boolean;
  /** Inject custom fetch for tests */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Cap response length; default 1024 tokens — enough for an action JSON
   * or a few paragraphs of markdown, without letting a runaway reply
   * burn budget. */
  maxTokens?: number;
}

export interface ChatResponse {
  response: string;
  error: string | null;
  usage?: { prompt_tokens: number; completion_tokens: number } | undefined;
}

export const DEFAULT_MODEL = 'z-ai/glm-5.1';
export const SEARCH_MODEL = 'perplexity/sonar';
export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Call OpenRouter chat completions. Pure function modulo fetch.
 * Returns `{ response, error }` — never throws. Empty response on error.
 */
export async function chat(
  apiKey: string,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<ChatResponse> {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) {
    return { response: '', error: 'OpenRouter API key missing or malformed' };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { response: '', error: 'messages must be a non-empty array' };
  }
  const model = opts.webSearch ? SEARCH_MODEL : (opts.model || DEFAULT_MODEL);
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    max_tokens: opts.maxTokens ?? 1024,
  };
  if (typeof opts.temperature === 'number') body['temperature'] = opts.temperature;
  const f = opts.fetchImpl ?? fetch;
  let resp: Response;
  try {
    resp = await f(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://zeed.run',
        'X-Title': 'Zeed Mobile',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    return { response: '', error: `network: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { response: '', error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
  }
  let json: {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    json = await resp.json();
  } catch (e) {
    return { response: '', error: `invalid json: ${e instanceof Error ? e.message : String(e)}` };
  }
  const content = json.choices?.[0]?.message?.content ?? '';
  const result: ChatResponse = {
    response: content,
    error: null,
  };
  if (json.usage) {
    result.usage = {
      prompt_tokens: json.usage.prompt_tokens ?? 0,
      completion_tokens: json.usage.completion_tokens ?? 0,
    };
  }
  return result;
}
