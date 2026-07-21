# Scaffold: ai-chat-assistant-widget (npm package + Cloudflare Worker proxy)

## Context

`/init` was run against an empty repo. The user redirected to scaffolding a new project: a floating AI chat assistant, packaged as an npm widget usable in any JS framework, backed by a Cloudflare Worker proxy the consumer deploys themselves, with a configurable LLM provider defaulting to OpenRouter.

A `PRD.md` in the repo is the source of truth for behavior — it documents an already-shipped implementation (`m-tech-org.github.io`, React 19 + Vite) and frames itself as "generalizes that implementation into a reusable spec." **The PRD has since been updated** (typing indicator, full-screen expand/collapse, a cooldown-based greeting popup, a corrected default bubble position, a reset button that was tried and removed, and a persona/data split for the system prompt). This revision re-syncs the plan to that update. Everything from the first PRD read (no streaming, `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` provider config, the full security control stack, role whitelist, localStorage persistence, drag-vs-click via Pointer Events, Playwright-as-primary-verification) still holds — see prior sections below, now folded in with the new material.

Locked-in decisions carried over from earlier Q&A:
- Package name: **`ai-chat-assistant-widget`** (confirmed unclaimed on npm).
- `git init` + one initial commit, authored as the existing global git identity (Towfiqul Islam <towfiq.106@gmail.com>) — **no `Co-Authored-By: Claude` trailer**, per explicit instruction.
- Environment already has Node v22.19.0, npm 11.17.0, wrangler 4.110.0 installed.

## What changed in this PRD update (and how the plan responds)

- **Default bubble position is now specified** (PRD §4.5): right edge, vertically centered — `x = vw - BUBBLE_SIZE - 24`, `y = (vh - BUBBLE_SIZE) / 2` — chosen over a corner default because it reads as reachable/inviting on first visit, not tucked next to cookie banners. Once dragged, the saved position overrides this on every future load. → `ChatWidgetCore`'s `defaultPosition()` must implement this exact formula, not a placeholder.
- **No reset/reload control** (PRD §4.6): explicitly tried and removed — a reload-style icon reads as "reload the page" to a visitor, not "clear this chat." → **Removed from this plan.** The panel header has only expand and close.
- **Typing indicator is animated dots, not text** (new PRD §4.9): three staggered bouncing dots instead of a "Thinking…" label — reads as "working" without a screen-reader-awkward text interruption mid-conversation. Keep `aria-live="polite"` + `aria-label="Assistant is thinking"` on the wrapper so it's still announced. Dots go static (no animation) under `prefers-reduced-motion`. → New behavior in `ui/render.ts`/`ui/styles.ts`.
- **Full-screen expand/collapse** (new PRD §4.10): a `Maximize2`/`Minimize2` header toggle between normal floating size and near-full-viewport, via **pure state/CSS** (not the Fullscreen API — no permission prompt, no page-navigation risk, no loss of state). Hide the bubble while expanded (redundant with header controls). Not persisted — always resets to collapsed when the panel closes. Animate the resize with a CSS transition. **Verification is specific and automated**, not a screenshot: assert zero `framenavigated` events fire across an expand→collapse cycle, and that already-rendered message DOM content is unchanged after the toggle. → New state (`isExpanded`) in `ChatWidgetCore`, new Playwright assertions.
- **First-load greeting popup uses a cooldown, not a one-time flag** (new PRD §4.11): shows once ~1.2s after mount if no conversation has started yet and the cooldown has elapsed since it last *appeared* — not since it was dismissed. The timestamp is written at show-time; getting this ordering wrong (writing at dismiss-time) means a visitor who clicks the bubble before the delay elapses silently burns the cooldown and the greeting never appears again until the next window, with no visible error. Cooldown (default 30 min), delay (default 1.2s), and the greeting message text are all **configuration**, not buried constants — exposed via `WidgetOptions` alongside `workerUrl`. Positioned relative to the bubble the same way the panel is (§4.5 logic), recomputed every render so it tracks a pre-dismissal drag. → New `showGreeting` state + `STORAGE_KEY_GREETED_AT` in `ChatWidgetCore`; new `WidgetOptions` fields `greetingMessage?`, `greetingDelayMs?`, `greetingCooldownMs?`.
- **System prompt is now explicitly two files with different jobs** (revised PRD §5.5): `RULESET.md` (persona/tone/behavior — identity, abbreviation expansion, strict grounding rules + a named fallback contact channel, etiquette/de-escalation, and — the easy-to-miss one — **explicit "plain text only, no Markdown" instruction**, since our widget renders with `textContent` and a model told to write "well-formatted answers" will default to `**bold**`/`[links](url)` syntax that shows up as literal characters otherwise) vs. `context.ts`'s site-specific `SITE_CONTEXT` (the consumer-edited manual-sync point, unchanged from before). Worker imports `RULESET.md` as raw text at build time (no runtime fetch, no duplicated copy to drift) via a Wrangler text-module rule. → Worker file layout and `wrangler.jsonc` both updated below.

## Architecture

```
Browser (any JS framework)         Edge Worker (Cloudflare)              Upstream LLM API
┌─────────────────────┐            ┌──────────────────────┐            ┌──────────────────┐
│ <ai-chat-widget>     │  POST      │ Origin allowlist       │  POST      │ OpenRouter (or any│
│  - floating bubble   │ ─────────► │ Rate limit (per IP)    │ ─────────► │ OpenAI-compatible │
│  - draggable         │  {messages}│ Sanitize + cap request │ {messages, │ /chat/completions)│
│  - message panel     │            │ Inject system prompt   │  model,..} │                    │
│  - localStorage      │ ◄───────── │ (server-side only)     │ ◄───────── │                    │
│    persistence       │  {choices} │ Forward, return        │            │                    │
└─────────────────────┘            └──────────────────────┘            └──────────────────┘
```

npm workspaces monorepo, two packages:

- **`packages/widget`** — the publishable npm package. `ChatWidgetCore` (framework-free class) owns all state (open/closed, expanded/collapsed, messages, input, loading, error, bubble position, greeting visibility) and behavior (drag-vs-click, localStorage persistence, panel placement, greeting cooldown, keyboard handling). `mount(el, options)` wires it to real DOM. `<ai-chat-widget>` is a thin Custom Element (Shadow DOM) wrapping `mount()`, for zero-integration embedding in any framework or plain HTML. Consumers needing callbacks (`onMessage`) call `mount()` directly instead of fighting attribute serialization. Built with tsup → ESM + CJS + IIFE + `.d.ts`.
- **`packages/worker`** — Cloudflare Worker (TypeScript + `wrangler.jsonc`), unpublished, deployed by each consumer to their own account via `wrangler deploy`. Holds the only copy of the LLM API key. Stateless.

Shared tooling (not PRD-specified, my choice): npm workspaces, tsup, Biome (single lint+format tool), `tsc --noEmit` for type-aware checks, Vitest for unit tests, **Playwright for E2E** (per PRD §7, the primary verification).

## Widget: feature set (from PRD §4, generalized)

- **Floating bubble, draggable, Pointer Events–based drag-vs-click**: `pointerdown` records start pos + `setPointerCapture`; `pointermove` computes delta, flips a `moved` flag past a `DRAG_THRESHOLD` (~6px), updates clamped position while `moved`; `pointerup` opens/closes the panel only if `!moved`. `touch-action: none` on the bubble (required alongside pointer capture, else mobile browsers try to scroll first). One code path for mouse/touch/pen — no separate handlers.
- **Position**: `{x, y}` in viewport coords, `position: fixed`, clamped inside viewport with a margin; re-clamp on `resize`. **Default position** (no saved position yet): right edge, vertically centered — `x = vw - BUBBLE_SIZE - 24`, `y = (vh - BUBBLE_SIZE) / 2` (PRD §4.5, see above). Persisted position always overrides this default once the visitor has dragged the bubble.
- **Panel placement**: derived from bubble position each time it opens — picks above/below and left/right based on available space so it's never off-screen or upside-down near an edge. Width/height shrink to fit small viewports.
- **Full-screen expand/collapse** (PRD §4.10): header `Maximize2`/`Minimize2` toggle, pure state/CSS (not `element.requestFullscreen()`), `top`/`left`/`width`/`height` set to viewport-minus-margins with a CSS transition. Hide the bubble while expanded. `isExpanded` is local, non-persisted, resets to collapsed whenever the panel closes.
- **Typing indicator** (PRD §4.9): three staggered bouncing dots while awaiting a response, `aria-live="polite"` + `aria-label="Assistant is thinking"` on the wrapper, animation disabled (static, reduced opacity) under `prefers-reduced-motion`.
- **First-load greeting popup** (PRD §4.11): appears once ~`greetingDelayMs` (default 1200ms) after mount, only if `messages.length === 0` and the cooldown (default 30 min, `greetingCooldownMs`) has elapsed since it last *appeared* (timestamp written at show-time, in `STORAGE_KEY_GREETED_AT`, not at dismiss-time — get this backwards and the greeting silently stops appearing with no error). Dismissing it (click to open, or its own close button) hides it without touching the timestamp. Positioned relative to the bubble using the same above/below/left/right logic as the panel, recomputed every render so it tracks a drag that happens before dismissal. Message text, delay, and cooldown are `WidgetOptions` fields, not hardcoded.
- **No reset/reload control** — deliberately omitted per PRD §4.6 (tried, removed; reads as "reload the page" to visitors). Panel header has only expand and close.
- **Persistence**: `messages` and `position` written to localStorage on every change; `greetedAt` written only when the greeting is shown. Namespaced keys (e.g. `ai-chat-widget:messages`, `ai-chat-widget:position`, `ai-chat-widget:greeted-at`), lazy-init loaders wrapped in try/catch returning safe defaults (private browsing / quota / corrupt value must not crash mount).
- **"Survives navigation"**: framework-agnostic version of PRD §4.2 — a Custom Element isn't destroyed unless removed from the DOM, so the guidance to consumers is "mount `<ai-chat-widget>` as a sibling of your router's swapped subtree, not inside it" — true for hash routing, React Router, Vue Router, etc. No special code needed beyond documenting it.
- **UX details to keep** (PRD §4.6): Escape closes panel; auto-focus input on open; auto-scroll to newest message; Enter sends / Shift+Enter newlines; `prefers-reduced-motion` disables panel/greeting open animations, the expand/collapse resize transition, and the bubble hover transform; `aria-label`/`aria-expanded`/`role="dialog"`/`aria-live="polite"` on the panel and loading indicator.
- **Graceful "not configured" state** (PRD §4.7): the widget always renders (bubble, panel) even with no `workerUrl` set — `isConfigured` gates only send affordances and swaps in an explanatory empty-state message.
- **Fetch wrapper — no streaming** (PRD §4.8): `sendChatMessage(messages): Promise<string>` posts only `{ messages }` (user/assistant turns only — no API key, model, system prompt, temperature from the client), parses `{ choices: [{ message: { content } }] }`, throws on non-ok or malformed shape.
- **Theming**: CSS custom properties on the shadow host (e.g. `--ai-chat-primary-color`, `--ai-chat-font-family`) so consumers can restyle without ejecting, per PRD §9.

### Widget public API additions

```ts
export interface WidgetOptions {
  workerUrl?: string;
  title?: string;
  placeholder?: string;
  theme?: 'light' | 'dark' | 'auto';
  initialMessages?: ChatMessage[];
  greetingMessage?: string;        // new — greeting popup copy
  greetingDelayMs?: number;        // new — default 1200
  greetingCooldownMs?: number;     // new — default 1_800_000 (30 min)
  unconfiguredMessage?: string;
  onMessage?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
}
```

**Post-implementation correction**: there's no `model` field anywhere client-side (not in `WidgetOptions`, not sent by the fetch wrapper, not an attribute on `<ai-chat-widget>`). An earlier draft of this plan had one, but PRD §4.8 is explicit that the client never sends a model name — "no model name... a deliberate trust boundary, not an oversight." Which model is used is entirely the Worker's decision (`AI_MODEL` secret). `sanitize.ts`'s field whitelist accepts no `model` field either.

## Worker: contract and security (from PRD §5)

```
OPTIONS  → CORS preflight, 204 immediately, no other checks
POST     → 1. Origin header must be in ALLOWED_ORIGINS, else 403 (documented as NOT real auth — trivially spoofable by non-browser clients)
           2. Required secrets present, else 500
           3. If RATE_LIMITER binding present, per-IP check, else 429 — fails open if binding absent (the real abuse boundary)
           4. Content-Length under MAX_BODY_BYTES, else 413
           5. Parse + sanitize: whitelist {messages, temperature, max_tokens} only, rebuild fresh object, else 400
           6. Role whitelist: only "user"/"assistant" — reject/strip any client-supplied "system" role (blocks prompt-injection overriding grounding)
           7. Clamp temperature to [0,2], max_tokens to [1, MAX_TOKENS_CAP]
           8. Prepend server-side SYSTEM_CONTEXT (RULESET.md + SITE_CONTEXT) as the system message
           9. Forward to `${AI_BASE_URL}/chat/completions` with AbortSignal.timeout(30_000)
           10. Return upstream JSON verbatim + CORS headers
other    → 405
```

- **Secrets** (`wrangler secret put`, never in `wrangler.jsonc`): `AI_API_KEY`, `AI_BASE_URL` (default documented as `https://openrouter.ai/api/v1`), `AI_MODEL` (kept a secret, not a constant — PRD §5.4: swap off a paid-tier model that 402s with a redeploy, no code change; verify a model is actually free-tier-accessible before wiring it in, e.g. via the provider's `/models` list).
- **Non-secret vars**: `ALLOWED_ORIGINS` (comma-separated).
- **Rate limiting**: Cloudflare-native `[[ratelimits]]` binding (`RATE_LIMITER`, `simple = { limit: 20, period: 60 }`, keyed by `CF-Connecting-IP`) — no external KV/Redis.
- **System prompt — split persona from data** (PRD §5.5, revised):
  - `src/RULESET.md` — persona/tone/behavior, fixed sections: IDENTITY & ROLE, ABBREVIATION & MEANING, GROUNDING & TRUTH (strict "only answer from context" rule + a named fallback contact channel + "never invent" rule), ETIQUETTE & SOFT SKILLS (tone + de-escalation line), COMMUNICATION GUIDELINES (answer length + **explicit plain-text-only instruction**, since this widget has no Markdown renderer — matches the `textContent`-only rendering decision), Contact Intent Handling. Written once, portable to the next site's assistant unchanged.
  - `src/context.ts` — `import RULESET from './RULESET.md'` (raw text, via a Wrangler text-module rule below) + a `SITE_CONTEXT` placeholder string (the consumer-edited manual-sync point — services/projects/contact info, changes whenever real site content changes) → exports `SYSTEM_CONTEXT = \`${RULESET}\n\n${SITE_CONTEXT}\``.
  - `wrangler.jsonc` needs a text-import rule so `RULESET.md` bundles as a string with no runtime fetch/FS access: `"rules": [{ "type": "Text", "globs": ["**/*.md"], "fallthrough": true }]` (jsonc equivalent of PRD's `[[rules]]` TOML block).
- Run `npx wrangler types` to generate `Env` — never hand-write it. No `nodejs_compat` needed (only `fetch`/`Response` used).

## Final folder layout

```
ai-chat-assistant-widget/
├── package.json                 # root: private, workspaces: ["packages/*"]
├── tsconfig.base.json
├── biome.jsonc
├── .gitignore                   # node_modules, dist, .wrangler, .dev.vars, *.tsbuildinfo, test-results
├── README.md                    # consumer quick start + repo dev instructions
├── CLAUDE.md                    # written last
├── PRD.md                       # already exists — source of truth, unchanged by this plan
├── plan.md                      # this file
├── playwright.config.ts         # not in the original draft of this layout — 4 webServers (stub upstream, wrangler dev, static vanilla example, React dev server)
├── examples/
│   ├── vanilla/index.html       # <script> tag embed smoke test
│   └── react/                   # small Vite+React app using mount() in useEffect, mounted outside router switch
├── packages/
│   ├── widget/
│   │   ├── package.json         # name: ai-chat-assistant-widget, exports map, files:["dist"]
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts       # index (esm+cjs+dts) + auto-register (esm+iife)
│   │   ├── vitest.config.ts     # environment: jsdom
│   │   └── src/
│   │       ├── index.ts                    # public entry: mount, ChatWidgetCore, types
│   │       ├── auto-register.ts            # side-effect entry: customElements.define(...)
│   │       ├── core/
│   │       │   ├── ChatWidgetCore.ts       # state + drag/position/persistence/panel-placement/expand/greeting logic
│   │       │   ├── mount.ts                # mount(el, options) -> WidgetInstance
│   │       │   ├── storage.ts              # namespaced localStorage load/save, try/catch safe defaults
│   │       │   └── types.ts                # WidgetOptions, ChatMessage, WidgetInstance, Position
│   │       ├── element/
│   │       │   └── AiChatWidgetElement.ts  # HTMLElement subclass, shadow root, observedAttributes
│   │       ├── ui/
│   │       │   ├── render.ts               # bubble, panel, greeting popup, typing dots, expand toggle (textContent only)
│   │       │   └── styles.ts               # constructed CSSStyleSheet, CSS custom properties, transitions, reduced-motion
│   │       └── transport/
│   │           └── sendChatMessage.ts      # POST {messages} -> string, no streaming
│   └── worker/
│       ├── package.json         # private:true, devDeps: wrangler, vitest, @cloudflare/vitest-pool-workers
│       ├── tsconfig.json
│       ├── wrangler.jsonc       # name, main, compatibility_date, vars.ALLOWED_ORIGINS, [[ratelimits]], rules (Text import), observability
│       ├── .dev.vars.example    # template for local secrets (gitignored: .dev.vars)
│       ├── vitest.config.ts     # cloudflareTest plugin (defineWorkersConfig was removed from the installed @cloudflare/vitest-pool-workers version — see Testing notes below), configPath -> wrangler.jsonc
│       └── src/
│           ├── index.ts         # request handling per the flow above
│           ├── RULESET.md       # persona/tone/behavior — imported as text into context.ts
│           ├── context.ts       # imports RULESET.md, defines SITE_CONTEXT (consumer-edited), exports SYSTEM_CONTEXT
│           ├── md.d.ts          # ambient `declare module '*.md'` so context.ts's RULESET.md import type-checks — not called out in the original draft, a natural consequence of the Text-import rule
│           ├── cors.ts          # origin allowlist + CORS headers
│           └── sanitize.ts      # field whitelist, role whitelist, value clamping, size/count caps
└── e2e/
    ├── chat-widget.spec.ts             # Playwright: bubble click, drag-vs-click, send/receive, persistence, expand/collapse, greeting cooldown
    ├── cross-page-persistence.spec.ts  # separate file, not folded into chat-widget.spec.ts — targets the React dev server, not the static vanilla example
    └── stub-upstream-server.mjs        # minimal OpenAI-compatible /chat/completions stand-in so the full round trip is testable offline/deterministically without a real provider API key
```

## Testing approach (PRD §7 — E2E is primary, not supplementary)

1. Unit tests (Vitest): `ChatWidgetCore` (state transitions, drag threshold math, default-position formula, panel placement, expand/collapse state, greeting cooldown logic with an injected clock/localStorage), `storage.ts` (corrupt/missing localStorage safe defaults), Worker `sanitize.ts`/`cors.ts` (whitelisting, role stripping, clamping), `context.ts` (RULESET + SITE_CONTEXT concatenation) as pure functions. 5 `@cloudflare/vitest-pool-workers` `SELF.fetch()` integration tests for the actual `/chat` route, scoped to paths that short-circuit before the upstream call (origin/method/JSON-shape/role-whitelist rejection) — the installed `@cloudflare/vitest-pool-workers` version (0.18.x) does not export `fetchMock` from `cloudflare:test` the way older docs describe, so upstream-passthrough coverage lives in the Playwright suite instead, against `e2e/stub-upstream-server.mjs`.
2. **Playwright E2E against a running `wrangler dev` + the vanilla example page** (PRD's explicit lesson: type-checking/build don't prove the feature works):
   - Click the bubble opens the panel; synthetic pointerdown/up with no movement also opens it; pointerdown+move+up past the threshold repositions without opening.
   - Type and send a real message against `e2e/stub-upstream-server.mjs` (a minimal OpenAI-compatible stand-in, since this environment has no real provider API key) — attach response/console listeners *before* sending so the actual Worker HTTP status/body is visible in test output, not a generic UI error.
   - Assert the rendered response reflects grounded content from a test `SITE_CONTEXT`.
   - Assert the typing indicator (dots wrapper, `aria-label="Assistant is thinking"`) is present while awaiting a response and gone after.
   - Toggle expand/collapse: assert zero `framenavigated` events fire across the cycle, and message DOM content is byte-identical before/after.
   - Greeting popup: using **real, shortened timers** on the example page (`greeting-delay-ms="500"`, `greeting-cooldown-ms="5000"`, not a mocked clock — simpler and avoids Playwright clock/timer interaction edge cases), assert it appears once after the delay, does not reappear immediately after dismissal within the cooldown, and does reappear once the cooldown window elapses — specifically covering the "written at show-time not dismiss-time" ordering bug from PRD §4.11.
   - Reload the page: assert messages and bubble position persisted from localStorage.
   - In the React example (a separate spec file, `e2e/cross-page-persistence.spec.ts`, since it targets the React dev server not the static vanilla example): open the chat, trigger a route change, assert the widget is still open with the same messages (proves "mount outside the swapped subtree" works for this package).

## Skills to load during implementation

- **`workers-best-practices`** — before writing `packages/worker/src/index.ts` and related Worker code (secrets, bindings, CORS, rate limiting, streaming vs. buffering choices).
- **`wrangler`** — before writing/running any `wrangler` command or `wrangler.jsonc` (the `rules` text-import block, `[[ratelimits]]`, `wrangler types`, `wrangler dev`/`deploy`/`secret put`).
- **`webapp-testing`** — before writing the Playwright `e2e/chat-widget.spec.ts` suite, since that's the primary verification method per PRD §7.
- **`cloudflare`** — general reference if a Workers question comes up that isn't covered by the two skills above.

## Ordered implementation steps

1. `git init`.
2. Root `.gitignore`, root `package.json` (workspaces), `tsconfig.base.json`, `biome.jsonc`.
3. Scaffold `packages/widget` config files (package.json, tsconfig, tsup.config, vitest.config).
4. Implement widget `src/`: `types.ts` → `storage.ts` → `ChatWidgetCore.ts` (drag/position/default-position/panel-placement/expand-collapse/greeting-cooldown/persistence) → `ui/render.ts` + `ui/styles.ts` (bubble, panel, typing dots, greeting popup, expand toggle) → `transport/sendChatMessage.ts` → `mount.ts` → `AiChatWidgetElement.ts` → `auto-register.ts`. Render with `textContent` only.
5. Scaffold `packages/worker`: `package.json`, `wrangler.jsonc` (incl. `[[ratelimits]]`, `rules` Text-import, `vars.ALLOWED_ORIGINS`), `.dev.vars.example`, `tsconfig.json`; run `npx wrangler types`.
6. Implement worker `src/`: `RULESET.md` (persona/tone/behavior template incl. plain-text-only instruction) → `context.ts` (imports RULESET.md, placeholder `SITE_CONTEXT`, exports `SYSTEM_CONTEXT`) → `sanitize.ts` (field/role whitelist, clamping, size/count caps) → `cors.ts` (origin allowlist + preflight) → `index.ts` (full request flow, rate limit, upstream forward with timeout).
7. Unit tests per the Testing section (Vitest, widget + worker).
8. Root scripts: `build`, `test` (unit), `test:e2e` (Playwright), `lint` (biome), `format`, `typecheck`.
9. `examples/vanilla/index.html` and `examples/react/` (small Vite+React app, widget mounted outside the routed subtree).
10. Playwright E2E suite (`e2e/chat-widget.spec.ts`) run against `wrangler dev` + the vanilla example, covering all items in the Testing section including expand/collapse and greeting-cooldown ordering.
11. Root `README.md`: consumer quick start (`npm install ai-chat-assistant-widget`, copy `packages/worker`, edit `SITE_CONTEXT` in `context.ts` with real content, `wrangler secret put AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL`, `wrangler deploy`, add both prod origin and localhost to `ALLOWED_ORIGINS`, embed `<ai-chat-widget worker-url="...">`), the origin-allowlist-is-not-auth caveat, and the free-tier-model gotcha from PRD §5.4.
12. `CLAUDE.md` last — commands (build/lint/test/test:e2e/typecheck, `wrangler dev`/`deploy`/`secret put`/`tail`) and the architecture split, written from the real repo structure once it exists.
13. Verify: `npm install` → `npm run build` → `npm run typecheck` → `npm run lint` → `npm test` all pass. `wrangler dev` in `packages/worker`, then run the Playwright suite against it and manually confirm a message round-trips, the typing indicator shows, expand/collapse works, and the greeting popup appears once.
14. `git add -A && git commit` — describes the initial scaffold, authored by the existing global git identity, **no `Co-Authored-By` trailer**.

**Verification results (step 13, actually run)**: `npm install`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` (59 unit tests) all pass; the full Playwright suite (7 specs) passes against a real `wrangler dev`. Two real bugs surfaced and were fixed during this pass, not caught by unit tests or type-checking — exactly the PRD §7 lesson this plan's testing philosophy is built around:
- **`[hidden]` had no effect** on `.bubble`/`.panel`/`.greeting`/`.typingIndicator` — each sets `display: flex` for its visible state, which beats the UA stylesheet's `[hidden] { display: none }` once an author stylesheet touches `display` on the same element. Fixed with an explicit `[hidden] { display: none !important }` rule in `ui/styles.ts`.
- **`ALLOWED_ORIGINS`** (`http://localhost:5173`, the React example's port) didn't cover the vanilla example's static-server port (`4173`), so every send from the vanilla example silently 403'd. The E2E `wrangler dev` command now passes `--var ALLOWED_ORIGINS:http://localhost:4173,http://localhost:5173` to cover both.
- Also caught in review (not by a test): the README's original "serve `examples/vanilla` directly" instruction would have broken the page's `../../packages/widget/dist` relative path — corrected to serve from the repo root.

Committed as `efd71cc` on `main`.

### Critical files
- `packages/widget/src/core/ChatWidgetCore.ts` (drag-vs-click, position/panel math, expand/collapse, greeting cooldown, persistence)
- `packages/widget/src/element/AiChatWidgetElement.ts`
- `packages/widget/src/ui/styles.ts` (incl. the `[hidden]` cascade fix found via E2E)
- `packages/worker/src/index.ts` (full security/request flow)
- `packages/worker/src/sanitize.ts` (role whitelist — the most important single control per PRD §5.3)
- `packages/worker/src/RULESET.md` + `packages/worker/src/context.ts` (persona/data split)
- `packages/worker/wrangler.jsonc` (rate-limit binding + text-import rule)
- `playwright.config.ts` (4 webServers, incl. `ALLOWED_ORIGINS` override for the test env)
- `e2e/chat-widget.spec.ts`, `e2e/cross-page-persistence.spec.ts`, `e2e/stub-upstream-server.mjs`
- `CLAUDE.md` (final step)
