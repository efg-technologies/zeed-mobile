# Zeed Autopilot — Privacy Contract

Autopilot (Path B) is an **opt-in** cloud execution mode for tasks that the
on-device agent cannot complete (CAPTCHA, heavy SPA, login-gated content).
It is a Manus-style ephemeral cloud VM, used strictly to serve the user.

## Data boundary

| Data | Location | Leaves device? |
|---|---|---|
| OpenRouter API key | iOS Keychain | No |
| Memory / Tasks / Bookmarks | Local SQLite on phone | **No, ever** |
| Browsing history | Local only | No |
| Autopilot goal text | Sent to Autopilot Worker | **Yes** (required) |
| URLs user explicitly pastes into agent | Sent to Autopilot Worker | **Yes** (required) |
| Final `summary` + selected `facts` | Returned to phone | Yes (explicit) |
| VM screenshots / DOM dumps / cookies | Stay in VM | **No** (destroyed with VM) |

## Lifecycle

1. User taps "Upgrade to Autopilot" on a stuck task.
2. Phone POSTs `{ goal, startUrl, constraints }` to Autopilot Worker
   (no Memory / Tasks / Bookmarks ever attached).
3. Worker spawns an E2B sandbox (amd64, Debian, ephemeral) and runs
   browser-use/Playwright.
4. Phone polls `GET /v1/runs/:id` for status; progress messages flow as
   coarse state only (`queued`, `running`, `succeeded`, `failed`).
5. On terminal state, phone fetches `GET /v1/runs/:id/result` — receives
   only `summary` and structured `facts`. Optional screenshots are opt-in
   per run.
6. Sandbox + all intermediate state (screenshots, DOM, cookies) are
   destroyed within 60 seconds of task completion.

## What we never do

- Persist autopilot session state across runs.
- Log goal text or result text server-side beyond the run lifetime.
- Inject Memory / Tasks / Bookmarks into the cloud VM.
- Reuse credentials between runs.
- Allow login to services that the user did not explicitly authorize
  (`allowLogin: false` by default; login requires per-run opt-in).

## User controls

- Autopilot is OFF by default. First use requires explicit opt-in dialog.
- Per-run: `maxSteps`, `maxSeconds`, `allowLogin` are user-adjustable.
- A kill-switch in Settings disables Autopilot globally; with it off, the
  app never contacts the Autopilot Worker.

## Legal / reviewer notes

- This mirrors the pattern Manus, Browser Use Cloud, and ChatGPT Agent use.
- Key difference from typical "AI agent" products: **persistent user data
  never crosses the phone boundary**. The cloud side is stateless compute.
