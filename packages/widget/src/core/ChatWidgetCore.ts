import { sendChatMessage } from '../transport/sendChatMessage.js';
import {
  loadGreetedAt,
  loadMessages,
  loadPosition,
  saveGreetedAt,
  saveMessages,
  savePosition,
} from './storage.js';
import type {
  ChatMessage,
  ChatWidgetState,
  PanelPlacement,
  Position,
  WidgetOptions,
} from './types.js';

export const BUBBLE_SIZE = 60;
export const VIEWPORT_MARGIN = 16;
export const DEFAULT_EDGE_OFFSET = 24;
export const DRAG_THRESHOLD = 6;
export const PANEL_WIDTH = 360;
export const PANEL_HEIGHT = 480;
export const PANEL_GAP = 12;
export const GREETING_WIDTH = 240;
export const GREETING_HEIGHT = 72;
export const GREETING_GAP = 12;

export const DEFAULT_GREETING_MESSAGE = 'Hi! 👋 Have a question? Ask away.';
export const DEFAULT_GREETING_DELAY_MS = 1200;
export const DEFAULT_GREETING_COOLDOWN_MS = 30 * 60 * 1000;
export const DEFAULT_UNCONFIGURED_MESSAGE =
  'This chat assistant is not configured yet. Please reach out through our contact page.';

type DefaultableOptions =
  | 'title'
  | 'placeholder'
  | 'theme'
  | 'draggable'
  | 'greetingMessage'
  | 'greetingDelayMs'
  | 'greetingCooldownMs'
  | 'unconfiguredMessage';

const DEFAULT_OPTIONS: Required<Pick<WidgetOptions, DefaultableOptions>> = {
  title: 'Chat Assistant',
  placeholder: 'Type a message…',
  theme: 'auto',
  draggable: true,
  greetingMessage: DEFAULT_GREETING_MESSAGE,
  greetingDelayMs: DEFAULT_GREETING_DELAY_MS,
  greetingCooldownMs: DEFAULT_GREETING_COOLDOWN_MS,
  unconfiguredMessage: DEFAULT_UNCONFIGURED_MESSAGE,
};

export type NormalizedWidgetOptions = WidgetOptions &
  Required<Pick<WidgetOptions, DefaultableOptions>>;

export type SendChatMessageFn = typeof sendChatMessage;

export interface ChatWidgetCoreDeps {
  transport?: SendChatMessageFn;
  now?: () => number;
}

type Listener = () => void;

export function clampPosition(
  pos: Position,
  viewportWidth: number,
  viewportHeight: number,
): Position {
  const maxX = viewportWidth - BUBBLE_SIZE - VIEWPORT_MARGIN;
  const maxY = viewportHeight - BUBBLE_SIZE - VIEWPORT_MARGIN;
  return {
    x: Math.min(Math.max(pos.x, VIEWPORT_MARGIN), Math.max(maxX, VIEWPORT_MARGIN)),
    y: Math.min(Math.max(pos.y, VIEWPORT_MARGIN), Math.max(maxY, VIEWPORT_MARGIN)),
  };
}

// Right edge, vertically centered — reads as reachable/inviting on a first
// visit, rather than tucked into a corner alongside cookie banners etc.
// Overridden permanently by a persisted position the moment a visitor drags.
export function defaultPosition(viewportWidth: number, viewportHeight: number): Position {
  return {
    x: viewportWidth - BUBBLE_SIZE - DEFAULT_EDGE_OFFSET,
    y: (viewportHeight - BUBBLE_SIZE) / 2,
  };
}

function computeFloatingPlacement(
  bubble: Position,
  viewportWidth: number,
  viewportHeight: number,
  boxWidth: number,
  boxHeight: number,
  gap: number,
): { top: number; left: number } {
  const spaceAbove = bubble.y;
  const spaceBelow = viewportHeight - (bubble.y + BUBBLE_SIZE);
  const top =
    spaceAbove >= boxHeight + gap || spaceAbove > spaceBelow
      ? Math.max(VIEWPORT_MARGIN, bubble.y - boxHeight - gap)
      : Math.min(viewportHeight - boxHeight - VIEWPORT_MARGIN, bubble.y + BUBBLE_SIZE + gap);

  const spaceLeft = bubble.x;
  const spaceRight = viewportWidth - (bubble.x + BUBBLE_SIZE);
  const left =
    spaceLeft >= boxWidth + gap || spaceLeft > spaceRight
      ? Math.max(VIEWPORT_MARGIN, bubble.x + BUBBLE_SIZE - boxWidth)
      : Math.min(viewportWidth - boxWidth - VIEWPORT_MARGIN, bubble.x);

  return { top, left };
}

export function computePanelPlacement(
  bubble: Position,
  viewportWidth: number,
  viewportHeight: number,
): PanelPlacement {
  const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const height = Math.min(PANEL_HEIGHT, viewportHeight - VIEWPORT_MARGIN * 2);
  const { top, left } = computeFloatingPlacement(
    bubble,
    viewportWidth,
    viewportHeight,
    width,
    height,
    PANEL_GAP,
  );
  return { top, left, width, height };
}

export function computeGreetingPlacement(
  bubble: Position,
  viewportWidth: number,
  viewportHeight: number,
): PanelPlacement {
  const width = Math.min(GREETING_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const height = GREETING_HEIGHT;
  const { top, left } = computeFloatingPlacement(
    bubble,
    viewportWidth,
    viewportHeight,
    width,
    height,
    GREETING_GAP,
  );
  return { top, left, width, height };
}

export function computeExpandedPlacement(
  viewportWidth: number,
  viewportHeight: number,
): PanelPlacement {
  return {
    top: VIEWPORT_MARGIN,
    left: VIEWPORT_MARGIN,
    width: viewportWidth - VIEWPORT_MARGIN * 2,
    height: viewportHeight - VIEWPORT_MARGIN * 2,
  };
}

// The cooldown clock runs from when the greeting last *appeared*, not from
// when it was dismissed — see ChatWidgetCore.scheduleGreeting for why.
export function shouldShowGreeting(
  now: number,
  messageCount: number,
  lastShownAt: number,
  cooldownMs: number,
): boolean {
  if (messageCount > 0) return false;
  if (lastShownAt && now - lastShownAt < cooldownMs) return false;
  return true;
}

function getViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 1024, height: 768 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export class ChatWidgetCore {
  private options: NormalizedWidgetOptions;
  private state: ChatWidgetState;
  private readonly transport: SendChatMessageFn;
  private readonly now: () => number;
  private readonly listeners = new Set<Listener>();
  private greetingTimer: ReturnType<typeof setTimeout> | null = null;
  private dragState: {
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null = null;

  constructor(options: WidgetOptions, deps: ChatWidgetCoreDeps = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.transport = deps.transport ?? sendChatMessage;
    this.now = deps.now ?? Date.now;

    const { width, height } = getViewportSize();
    const savedPosition = loadPosition();
    const storedMessages = loadMessages();

    this.state = {
      isOpen: false,
      isExpanded: false,
      messages:
        storedMessages.length === 0 && this.options.initialMessages
          ? this.options.initialMessages
          : storedMessages,
      input: '',
      isLoading: false,
      error: null,
      position: savedPosition
        ? clampPosition(savedPosition, width, height)
        : defaultPosition(width, height),
      showGreeting: false,
    };
  }

  /** Starts side effects (the greeting timer). Kept out of the constructor on purpose. */
  start(): void {
    this.scheduleGreeting();
  }

  destroy(): void {
    if (this.greetingTimer !== null) {
      clearTimeout(this.greetingTimer);
      this.greetingTimer = null;
    }
    this.listeners.clear();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): ChatWidgetState {
    return this.state;
  }

  getOptions(): NormalizedWidgetOptions {
    return this.options;
  }

  updateOptions(partial: Partial<WidgetOptions>): void {
    this.options = { ...this.options, ...partial };
    this.emit();
  }

  isConfigured(): boolean {
    return Boolean(this.options.workerUrl);
  }

  open(): void {
    if (this.state.isOpen) return;
    this.dismissGreeting();
    this.setState({ isOpen: true });
  }

  close(): void {
    if (!this.state.isOpen) return;
    this.setState({ isOpen: false, isExpanded: false });
  }

  toggleOpen(): void {
    if (this.state.isOpen) this.close();
    else this.open();
  }

  toggleExpand(): void {
    if (!this.state.isOpen) return;
    this.setState({ isExpanded: !this.state.isExpanded });
  }

  setInput(value: string): void {
    this.setState({ input: value });
  }

  dismissGreeting(): void {
    if (!this.state.showGreeting) return;
    this.setState({ showGreeting: false });
  }

  onBubblePointerDown(clientX: number, clientY: number): void {
    this.dragState = {
      startX: clientX,
      startY: clientY,
      origX: this.state.position.x,
      origY: this.state.position.y,
      moved: false,
    };
  }

  onBubblePointerMove(clientX: number, clientY: number): void {
    if (!this.options.draggable) return;
    const drag = this.dragState;
    if (!drag) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      drag.moved = true;
    }
    if (drag.moved) {
      const { width, height } = getViewportSize();
      const next = clampPosition({ x: drag.origX + dx, y: drag.origY + dy }, width, height);
      this.setState({ position: next });
    }
  }

  // Returns true if this was a plain click (no movement past the threshold) so
  // the caller (the Custom Element) knows a click-derived side effect, if any,
  // already happened via toggleOpen().
  onBubblePointerUp(): boolean {
    const drag = this.dragState;
    this.dragState = null;
    if (!drag) return false;
    if (!drag.moved) {
      this.toggleOpen();
      return true;
    }
    return false;
  }

  onViewportResize(): void {
    const { width, height } = getViewportSize();
    this.setState({ position: clampPosition(this.state.position, width, height) });
  }

  async sendMessage(content?: string): Promise<void> {
    const trimmed = (content ?? this.state.input).trim();
    if (!trimmed || this.state.isLoading) return;

    if (!this.isConfigured()) {
      this.setState({ error: this.options.unconfiguredMessage });
      return;
    }

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...this.state.messages, userMessage];
    this.setState({ messages: nextMessages, input: '', isLoading: true, error: null });
    this.options.onMessage?.(userMessage);

    try {
      const workerUrl = this.options.workerUrl;
      if (!workerUrl) throw new Error(this.options.unconfiguredMessage);
      const replyContent = await this.transport(nextMessages, { workerUrl });
      const assistantMessage: ChatMessage = { role: 'assistant', content: replyContent };
      this.setState({ messages: [...this.state.messages, assistantMessage], isLoading: false });
      this.options.onMessage?.(assistantMessage);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      this.setState({ isLoading: false, error: error.message });
      this.options.onError?.(error);
    }
  }

  // Intentionally a one-shot effect run once against the state captured at
  // start(), not re-evaluated on later message changes — matches the PRD's
  // "first-load" semantics (no conversation yet + cooldown elapsed), not a
  // literal one-time-ever flag.
  private scheduleGreeting(): void {
    if (!this.isConfigured()) return;
    const lastShownAt = loadGreetedAt();
    if (
      !shouldShowGreeting(
        this.now(),
        this.state.messages.length,
        lastShownAt,
        this.options.greetingCooldownMs,
      )
    ) {
      return;
    }
    this.greetingTimer = setTimeout(() => {
      this.greetingTimer = null;
      // Timestamp is written when the greeting actually appears, not when
      // dismissed — writing at dismiss-time lets a visitor who clicks the
      // bubble before the delay elapses silently burn the cooldown window.
      saveGreetedAt(this.now());
      this.setState({ showGreeting: true });
    }, this.options.greetingDelayMs);
  }

  private setState(patch: Partial<ChatWidgetState>): void {
    this.state = { ...this.state, ...patch };
    if ('messages' in patch) saveMessages(this.state.messages);
    if ('position' in patch) savePosition(this.state.position);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
