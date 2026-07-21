# TODO — ai-chat-assistant-widget

Granular breakdown of `plan.md`. Each item is a small, mostly self-contained unit of work. Status is tracked per phase (`TODO` / `PENDING` / `FINISH`); "Depends on" lists phases that must reach `FINISH` first — `None` means it can start immediately alongside Phase 0.

## Phase 0 — Repo bootstrap
**Status:** FINISH
**Depends on:** None

- [x] `git init`
- [x] Root `.gitignore` (node_modules, dist, .wrangler, .dev.vars, *.tsbuildinfo, test-results)
- [x] Root `package.json` (`private: true`, `workspaces: ["packages/*"]`)
- [x] Root `tsconfig.base.json` (strict, ES2022, NodeNext)
- [x] Root `biome.jsonc`

## Phase 1 — Widget package skeleton
**Status:** FINISH
**Depends on:** Phase 0

- [x] `packages/widget/package.json` (name `ai-chat-assistant-widget`, exports map, `files: ["dist"]`)
- [x] `packages/widget/tsconfig.json` (extends base)
- [x] `packages/widget/tsup.config.ts` (two entries: index esm+cjs+dts, auto-register esm+iife)
- [x] `packages/widget/vitest.config.ts` (jsdom)

## Phase 2 — Widget core logic
**Status:** FINISH
**Depends on:** Phase 1

- [x] `core/types.ts` — `WidgetOptions`, `ChatMessage`, `WidgetInstance`, `Position`
- [x] `core/storage.ts` — namespaced localStorage load/save, try/catch safe defaults
- [x] `core/ChatWidgetCore.ts` (base) — state container: open/closed, messages, input, loading, error
- [x] `ChatWidgetCore` — drag-vs-click Pointer Events logic (threshold + pointer capture)
- [x] `ChatWidgetCore` — position clamping + default-position formula (right edge, vertically centered)
- [x] `ChatWidgetCore` — panel-placement math (above/below, left/right, shrink-to-fit)
- [x] `ChatWidgetCore` — expand/collapse (fullscreen) state, non-persisted, resets on close
- [x] `ChatWidgetCore` — greeting-popup cooldown logic (timestamp at show-time)
- [x] `transport/sendChatMessage.ts` — fetch wrapper, no streaming, response-shape validation. **Deviation from plan**: no `model` field/option anywhere client-side — PRD §4.8 is explicit that the client never sends a model name (deliberate trust boundary), so this was dropped from `WidgetOptions`, the fetch wrapper, and the Custom Element's attributes, not just left as originally sketched in this plan's "Widget public API additions" snippet.
- [x] `ui/styles.ts` — constructed stylesheet, CSS custom properties, transitions, reduced-motion overrides. Also required a `[hidden] { display: none !important }` override, found via E2E — see Phase 7.
- [x] `ui/render.ts` — bubble DOM
- [x] `ui/render.ts` — panel DOM (message list, input, send button)
- [x] `ui/render.ts` — typing-indicator dots (aria-live, aria-label)
- [x] `ui/render.ts` — greeting-popup DOM
- [x] `ui/render.ts` — expand/collapse header toggle
- [x] `core/mount.ts` — wire core + render + transport into `mount(el, options)`
- [x] `element/AiChatWidgetElement.ts` — Custom Element, shadow root, `observedAttributes`
- [x] `auto-register.ts` — `customElements.define(...)` side-effect entry
- [x] `index.ts` — public exports (`mount`, `ChatWidgetCore`, types)

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

- [x] `src/RULESET.md` — persona/tone/behavior template (identity, abbreviations, grounding rules, etiquette, plain-text-only instruction, contact-intent handling)
- [x] `src/context.ts` — import `RULESET.md` as text + placeholder `SITE_CONTEXT` → export `SYSTEM_CONTEXT` (needs `src/md.d.ts` ambient `declare module '*.md'` — not called out in plan.md's worker file layout, added as a natural consequence of the Text-import rule)
- [x] `src/cors.ts` — origin allowlist check + CORS headers + OPTIONS preflight
- [x] `src/sanitize.ts` — field whitelist, role whitelist (strip `system`), value clamping, size/count caps (no `model` field accepted from client either — see the widget-side note above)
- [x] `src/index.ts` — request flow: secrets check → rate limit → body-size check → sanitize → prepend system prompt → forward upstream with timeout → return

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

- [x] `playwright.config.ts` at repo root (not called out in plan.md's folder layout) + `e2e/stub-upstream-server.mjs`, 4 webServers: stub upstream, `wrangler dev`, static vanilla example, React dev server
- [x] `e2e/chat-widget.spec.ts` — bubble click opens panel (incl. synthetic no-move pointer down/up); drag vs. click distinguishing; send/receive a message with grounded content; typing indicator visible then gone; expand/collapse with zero `framenavigated` events + unchanged message DOM; greeting popup cooldown ordering; reload persistence (messages + position)
- [x] `e2e/cross-page-persistence.spec.ts` — **separate file from `chat-widget.spec.ts`** (plan.md's folder layout only names one spec file) since it targets the React dev server, not the static vanilla example: widget stays open/retains messages across a hash-route change
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
**Status:** FINISH
**Depends on:** Phase 6, Phase 7, Phase 8, Phase 9

- [x] Full verification run: `npm install && npm run build && npm run typecheck && npm run lint && npm test` — all clean (59 unit tests passing)
- [x] `wrangler dev` + full Playwright suite against it — 7/7 passing
- [x] Fixed a doc bug found during review: README's "serve examples/vanilla directly" instruction would have broken the page's `../../packages/widget/dist` relative path; corrected to serve from repo root
- [x] `git add -A && git commit` — commit `efd71cc` on `main`, authored by Towfiqul Islam <towfiq.106@gmail.com>, no `Co-Authored-By` trailer, working tree clean
