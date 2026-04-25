# App Store Description — English (4000 char max)

Zeed is a private, AI-first mobile browser. Bring your own OpenRouter
API key and choose freely from 300+ LLMs (GPT, Claude, Gemini, GLM,
DeepSeek, Llama, and more). Your memory, bookmarks, and reading history
stay on the device by design.

WHY ZEED

- Bring your own LLM. Pay the model provider directly through your own
  OpenRouter key. No managed-LLM markup, no vendor lock-in. Switch
  models per task.

- Privacy by construction. Memory, bookmarks, tasks, chat history, and
  the Context Map are stored exclusively on your device. Optional
  telemetry is opt-in and limited to a small set of anonymous
  diagnostic and usage events (install, session start, daily heartbeat,
  feature counters, agent run outcome, crash hash). Browsing URLs,
  page contents, and chat contents are never transmitted.

- Three modes for one input. Auto guesses what you want. Ask treats
  the field as a conversation. Search treats it as a query. Move
  between modes with a single tap.

- Tabs as memory. The browser tracks Profile → TabGroup → Tab. The
  agent reasons over the tabs you have open and the tabs you closed
  in the same group.

- Private profile is zero-trace. While Private is on, the browser does
  not write to memory, build the Context Map, run agents, produce
  recommendations, or send telemetry.

- Markdown + zeed-graph. Chat replies render with full Markdown and an
  embedded graph format for showing structure (relationships, options,
  decision trees) inline.

WHAT THE AGENT CAN DO

The agent reads the current page and can:

- Click links, fill forms, navigate
- Open new tabs, switch between them
- Search the web (when given a research goal)
- Read and summarize content from the active tab

What it will not do silently:

- Submit forms, make purchases, or send messages without explicit
  confirmation
- Run while you are in Private profile
- Store anything from your Private session

WHAT'S NEXT (ROADMAP)

- Cloud Autopilot (Path B) — opt-in cloud execution for long-running
  tasks, with a strict data boundary
- Cross-device sync — opt-in, end-to-end encrypted (Phase 6)
- Scheduled task execution ("cron") — let the agent run morning
  briefings or weekly checks unattended (Phase 6+)

REQUIREMENTS

- An OpenRouter API key (free to create at openrouter.ai)
- iOS 16 or later
- Active internet connection for chat and the agent loop

PRIVACY

- Data not collected: browsing URLs, page contents, chat contents,
  memory, bookmarks, IP address, email
- Data collected (anonymous, opt-in): install ID (random UUID),
  app version, OS, daily heartbeat, session start, feature counters
  from a fixed allowlist, agent run outcome (success / step count /
  termination reason), and crash stack hash
- Telemetry is OFF by default
- See full policy: https://zeed.run/privacy

QUESTIONS

support@efg-technologies.com
