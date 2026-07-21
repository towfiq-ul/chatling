# TODO — ai-chat-assistant-widget

Granular breakdown of `plan.md`. Each item is a small, mostly self-contained unit of work. Status is tracked per phase (`TODO` / `PENDING` / `FINISH`); "Depends on" lists phases that must reach `FINISH` first — `None` means it can start immediately alongside Phase 0.

## Phase 0 — Repo bootstrap
**Status:** FINISH
**Depends on:** None

- [ ] `git init`
- [ ] Root `.gitignore` (node_modules, dist, .wrangler, .dev.vars, *.tsbuildinfo, test-results)
- [ ] Root `package.json` (`private: true`, `workspaces: ["packages/*"]`)
- [ ] Root `tsconfig.base.json` (strict, ES2022, NodeNext)
- [ ] Root `biome.jsonc`

## Phase 1 — Widget package skeleton
**Status:** FINISH
**Depends on:** Phase 0

- [ ] `packages/widget/package.json` (name `ai-chat-assistant-widget`, exports map, `files: ["dist"]`)
- [ ] `packages/widget/tsconfig.json` (extends base)
- [ ] `packages/widget/tsup.config.ts` (two entries: index esm+cjs+dts, auto-register esm+iife)
- [ ] `packages/widget/vitest.config.ts` (jsdom)

## Phase 2 — Widget core logic
**Status:** FINISH
**Depends on:** Phase 1

- [ ] `core/types.ts` — `WidgetOptions`, `ChatMessage`, `WidgetInstance`, `Position`
- [ ] `core/storage.ts` — namespaced localStorage load/save, try/catch safe defaults
- [ ] `core/ChatWidgetCore.ts` (base) — state container: open/closed, messages, input, loading, error
- [ ] `ChatWidgetCore` — drag-vs-click Pointer Events logic (threshold + pointer capture)
- [ ] `ChatWidgetCore` — position clamping + default-position formula (right edge, vertically centered)
- [ ] `ChatWidgetCore` — panel-placement math (above/below, left/right, shrink-to-fit)
- [ ] `ChatWidgetCore` — expand/collapse (fullscreen) state, non-persisted, resets on close
- [ ] `ChatWidgetCore` — greeting-popup cooldown logic (timestamp at show-time)
- [ ] `transport/sendChatMessage.ts` — fetch wrapper, no streaming, response-shape validation
- [ ] `ui/styles.ts` — constructed stylesheet, CSS custom properties, transitions, reduced-motion overrides
- [ ] `ui/render.ts` — bubble DOM
- [ ] `ui/render.ts` — panel DOM (message list, input, send button)
- [ ] `ui/render.ts` — typing-indicator dots (aria-live, aria-label)
- [ ] `ui/render.ts` — greeting-popup DOM
- [ ] `ui/render.ts` — expand/collapse header toggle
- [ ] `core/mount.ts` — wire core + render + transport into `mount(el, options)`
- [ ] `element/AiChatWidgetElement.ts` — Custom Element, shadow root, `observedAttributes`
- [ ] `auto-register.ts` — `customElements.define(...)` side-effect entry
- [ ] `index.ts` — public exports (`mount`, `ChatWidgetCore`, types)

## Phase 3 — Worker package skeleton
**Status:** FINISH
**Depends on:** Phase 0

- [x] `packages/worker/package.json` (`private: true`, devDeps: wrangler, vitest, `@cloudflare/vitest-pool-workers`)
- [x] `packages/worker/wrangler.jsonc` (name, main, compatibility_date, `vars.ALLOWED_ORIGINS`, `[[ratelimits]]`, `rules` text-import, observability)
- [x] `packages/worker/.dev.vars.example`
- [x] `packages/worker/tsconfig.json`
- [x] Run `npx wrangler types` to generate `Env`

## Phase 4 — Worker logic
**Status:** FINISH
**Depends on:** Phase 3

- [ ] `src/RULESET.md` — persona/tone/behavior template (identity, abbreviations, grounding rules, etiquette, plain-text-only instruction, contact-intent handling)
- [ ] `src/context.ts` — import `RULESET.md` as text + placeholder `SITE_CONTEXT` → export `SYSTEM_CONTEXT`
- [ ] `src/cors.ts` — origin allowlist check + CORS headers + OPTIONS preflight
- [ ] `src/sanitize.ts` — field whitelist, role whitelist (strip `system`), value clamping, size/count caps
- [ ] `src/index.ts` — request flow: secrets check → rate limit → body-size check → sanitize → prepend system prompt → forward upstream with timeout → return

## Phase 5 — Examples
**Status:** FINISH
**Depends on:** Phase 2

- [x] `examples/vanilla/index.html` — script-tag embed smoke test
- [x] `examples/react/` — scaffold small Vite+React app
- [x] Wire `mount()` into the React example, mounted outside the router's swapped subtree

## Phase 6 — Unit tests (Vitest)
**Status:** FINISH
**Depends on:** Phase 2, Phase 4

- [x] `ChatWidgetCore` — drag threshold math
- [x] `ChatWidgetCore` — default-position formula
- [x] `ChatWidgetCore` — panel-placement logic
- [x] `ChatWidgetCore` — expand/collapse state transitions
- [x] `ChatWidgetCore` — greeting-cooldown logic (mocked clock/localStorage)
- [x] `storage.ts` — safe defaults on corrupt/missing localStorage
- [x] `sanitize.ts` — field/role whitelist + clamping
- [x] `cors.ts` — origin allowlist behavior
- [x] `context.ts` — RULESET + SITE_CONTEXT concatenation
- [x] Worker `index.ts` — 5 `SELF.fetch()` integration tests (short-circuit validation paths; fetchMock from cloudflare:test is not available in this vitest-pool-workers version, upstream passthrough is covered by Playwright E2E instead)

## Phase 7 — E2E tests (Playwright, against `wrangler dev` + vanilla example)
**Status:** FINISH
**Depends on:** Phase 4, Phase 5

- [x] Playwright config (4 webServers: stub upstream, `wrangler dev`, static vanilla example, React dev server) + `e2e/stub-upstream-server.mjs`
- [x] Spec: bubble click opens panel (incl. synthetic no-move pointer down/up)
- [x] Spec: drag vs. click distinguishing (pointer move past threshold repositions, doesn't open)
- [x] Spec: send/receive a message, assert grounded response content
- [x] Spec: typing indicator visible while awaiting response, gone after
- [x] Spec: expand/collapse — zero `framenavigated` events, message DOM unchanged
- [x] Spec: greeting popup — appears once after delay, doesn't reappear immediately after dismissal, does reappear after cooldown (real short timers: 500ms delay / 5s cooldown on the example page, not mocked)
- [x] Spec: reload persistence — messages + bubble position survive a reload
- [x] Spec: cross-page persistence — widget stays open/retains messages across a route change (React example)
- [x] Found + fixed 2 real bugs via E2E: `[hidden]` was losing to `.panel/.bubble/.greeting/.typingIndicator { display: flex }` in the cascade (added a `[hidden] { display: none !important }` override); `ALLOWED_ORIGINS` didn't cover the vanilla example's port

## Phase 8 — Root tooling/scripts
**Status:** FINISH
**Depends on:** Phase 0

- [x] `build` script (`npm run build --workspaces --if-present`)
- [x] `test` script (unit)
- [x] `test:e2e` script (Playwright)
- [x] `lint` / `format` scripts (biome)
- [x] `typecheck` script (`tsc --noEmit` per workspace)

## Phase 9 — Docs
**Status:** FINISH
**Depends on:** Phase 2, Phase 4

- [x] `README.md` — consumer quick start, deploy sequence, origin-allowlist caveat, free-tier-model gotcha
- [x] `CLAUDE.md` — commands + architecture overview, written from the real repo structure

## Phase 10 — Verify & commit
**Status:** PENDING
**Depends on:** Phase 6, Phase 7, Phase 8, Phase 9

- [ ] Full verification run: `npm install && npm run build && npm run typecheck && npm run lint && npm test`
- [ ] `wrangler dev` + run Playwright suite against it, manual smoke check
- [ ] `git add -A && git commit` (existing global git identity, no `Co-Authored-By` trailer)
