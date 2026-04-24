# Zeed Mobile

iOS AI browser on Expo. Phase 5 feasibility spike.

Spec: [lab/plans/orion/mobile-expo.md](https://github.com/efg-technologies/lab/blob/main/plans/orion/mobile-expo.md).

## Architecture

- `App.tsx` — root: full-screen WebView + bottom sheet chat
- `src/agent/` — agent loop, tools, loop-guard
- `src/autopilot/` — cloud-VM autopilot client (Manus-style for heavy tasks)
- `src/llm/openrouter.ts` — OpenRouter client
- `src/storage/secure.ts` — iOS Keychain wrapper (expo-secure-store)
- `src/webview/bridge.ts` — WebView ↔ RN JS injection helpers

## Two Agent paths

Path A — local JS injection (default for simple tasks):
`click_by_label` / `read_page` / `type` — runs inside WebView via
`evaluateJavaScript`. No cloud hop.

Path B — Autopilot on cloud VM (explicit opt-in for heavy tasks):
Mobile sends task to `zeed-autopilot-worker`, which spins up an
ephemeral sandbox (E2B-style) and runs `browser-use` + vision there.
**Persistent data never leaves the phone.** Only ephemeral task data
exists in the VM, discarded on session end. See
`docs/autopilot-privacy.md`.

## Development

```sh
npm install
npm run typecheck
npm test

# Expo Go (weekly-1 dogfood)
npm start
# scan QR with Expo Go on iPhone

# EAS Build → TestFlight (weekly-2+)
npm install -g eas-cli
eas login
eas build --platform ios --profile preview
# Then submit to TestFlight via App Store Connect
```

## TestFlight prerequisites (user manual)

1. Apple Developer Program ($99/yr)
2. Register your iPhone's UDID at https://developer.apple.com
3. `eas init` → fills `app.json` `extra.eas.projectId`
4. `eas build --platform ios --profile preview`
5. `eas submit --platform ios` (auto-uploads to App Store Connect)
6. Invite yourself as internal tester in App Store Connect

For pure self-dogfood without TestFlight: use Expo Go + QR.

## Tests

Unit tests run via node's native test runner (`node --test`), no Jest:

```sh
npm test           # all unit tests
npm run test:watch # TDD mode
```

All pure TS modules (`src/agent/`, `src/autopilot/`, `src/llm/`) have
`*.test.ts` colocated. No iOS simulator required for unit tests.

## Non-goals (explicit)

- Chromium fork on iOS (App Store forbids non-WebKit engines)
- Android (Phase 5 signal gate first)
- Cloud sync of memory/tasks (Phase 6)
- Server-side persistent storage of user data (only ephemeral autopilot
  VM, destroyed per session)
