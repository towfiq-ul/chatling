# chatling

A floating AI chat assistant widget — draggable, persists across navigation and reloads, answers
only from content you provide, and never exposes your LLM provider's API key to the browser.
Framework-agnostic: use it as a `<script>`-tag Custom Element on a plain HTML page, or call
`mount()` directly from React, Vue, or anything else.

The browser never talks to an LLM API directly. This package only renders the UI and talks to a
backend URL you provide — pair it with the companion Cloudflare Worker proxy (in the
[full repo](https://github.com/towfiq-ul/chatling)), which you deploy to your own Cloudflare
account, so you control your own API key and rate limits.

## Install

```bash
npm install chatling
```

## Usage

**Zero-build, plain HTML** — a `<script>` tag registers `<chatling-widget>` as a Custom Element:

```html
<script src="https://unpkg.com/chatling/dist/auto-register.global.js"></script>
<chatling-widget
  worker-url="https://your-worker.your-subdomain.workers.dev"
  title="Site Assistant"
  placeholder="Ask a question…"
  theme="auto"
></chatling-widget>
```

**Any JS framework** — call `mount()` directly (needed for callbacks like `onMessage`, which can't
be serialized as an HTML attribute):

```ts
import { mount } from 'chatling';

const instance = mount(document.getElementById('chat-widget-root'), {
  workerUrl: 'https://your-worker.your-subdomain.workers.dev',
  title: 'Site Assistant',
  onMessage: (message) => console.log(message),
});

// later, e.g. on component unmount:
instance.destroy();
```

**Important for SPAs**: mount the widget as a **sibling** of whatever subtree your router swaps on
navigation, not inside it — otherwise the router will unmount and remount it (losing its
open/closed state, messages, and position) on every route change.

If `workerUrl` is omitted, the widget still renders (bubble, panel) but shows a "not configured"
message instead of a broken/erroring chat — safe to embed before your backend is deployed.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `workerUrl` | `string?` | — | Your backend's chat endpoint. Omit to render in "not configured" mode. |
| `title` | `string?` | `"Chat Assistant"` | Panel header title. |
| `placeholder` | `string?` | `"Type a message…"` | Input placeholder. |
| `theme` | `'light' \| 'dark' \| 'auto'?` | `"auto"` | |
| `draggable` | `boolean?` | `true` | Set `false` to keep the bubble fixed in place (Custom Element attribute: `bubble-draggable="false"`). |
| `initialMessages` | `ChatMessage[]?` | — | Seeds the conversation if nothing is in localStorage yet. |
| `greetingMessage` | `string?` | — | First-load greeting popup text. |
| `greetingDelayMs` | `number?` | `1200` | Delay before the greeting appears. |
| `greetingCooldownMs` | `number?` | `1800000` (30 min) | How long before the greeting can reappear. |
| `unconfiguredMessage` | `string?` | — | Shown instead of chat input when `workerUrl` is unset. |
| `onMessage` | `(message: ChatMessage) => void` | — | Fires for both user and assistant messages. |
| `onError` | `(error: Error) => void` | — | Fires on a failed send. |

Theming is via CSS custom properties on the host element (e.g. `--chatling-primary-color`,
`--chatling-font-family`) — set them on `<chatling-widget>` or on the container passed to `mount()`.

## Full docs

See the [repository](https://github.com/towfiq-ul/chatling) for the Cloudflare Worker backend you
need to pair this with, deployment instructions, the design rationale (`PRD.md`), and contributing
guide.

## License

MIT
