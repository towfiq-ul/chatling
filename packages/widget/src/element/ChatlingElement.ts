import { mount } from '../core/mount.js';
import type { ChatMessage, WidgetInstance, WidgetOptions } from '../core/types.js';

const OBSERVED_ATTRS = [
  'worker-url',
  'title',
  'placeholder',
  'theme',
  'bubble-draggable',
  'greeting-message',
  'greeting-delay-ms',
  'greeting-cooldown-ms',
] as const;

type ObservedAttr = (typeof OBSERVED_ATTRS)[number];

// Named "bubble-draggable" rather than "draggable" to avoid colliding with
// HTMLElement's own reflected "draggable" attribute (native drag-and-drop),
// which is unrelated to repositioning the chat bubble.
const ATTR_TO_OPTION: Record<ObservedAttr, keyof WidgetOptions> = {
  'worker-url': 'workerUrl',
  title: 'title',
  placeholder: 'placeholder',
  theme: 'theme',
  'bubble-draggable': 'draggable',
  'greeting-message': 'greetingMessage',
  'greeting-delay-ms': 'greetingDelayMs',
  'greeting-cooldown-ms': 'greetingCooldownMs',
};

const NUMERIC_OPTIONS = new Set<keyof WidgetOptions>(['greetingDelayMs', 'greetingCooldownMs']);
const BOOLEAN_OPTIONS = new Set<keyof WidgetOptions>(['draggable']);

/**
 * Zero-integration embed for any framework: `<chatling-widget worker-url="...">`.
 * Primitives are set as kebab-case attributes; callbacks and message arrays
 * are set as JS properties (`el.onMessage = ...`) since attributes can only
 * ever be strings.
 */
export class ChatlingElement extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return OBSERVED_ATTRS;
  }

  private instance: WidgetInstance | null = null;
  private _onMessage?: (message: ChatMessage) => void;
  private _onError?: (error: Error) => void;
  private _initialMessages?: ChatMessage[];

  get onMessage(): ((message: ChatMessage) => void) | undefined {
    return this._onMessage;
  }

  set onMessage(handler: ((message: ChatMessage) => void) | undefined) {
    this._onMessage = handler;
    this.instance?.updateOptions({ onMessage: handler });
  }

  get onError(): ((error: Error) => void) | undefined {
    return this._onError;
  }

  set onError(handler: ((error: Error) => void) | undefined) {
    this._onError = handler;
    this.instance?.updateOptions({ onError: handler });
  }

  get initialMessages(): ChatMessage[] | undefined {
    return this._initialMessages;
  }

  set initialMessages(messages: ChatMessage[] | undefined) {
    this._initialMessages = messages;
  }

  connectedCallback(): void {
    if (this.instance) return;
    this.instance = mount(this, this.readOptionsFromAttributes());
  }

  disconnectedCallback(): void {
    this.instance?.destroy();
    this.instance = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.instance) return;
    const optionKey = ATTR_TO_OPTION[name as ObservedAttr];
    if (!optionKey) return;
    const value: unknown = NUMERIC_OPTIONS.has(optionKey)
      ? Number(newValue)
      : BOOLEAN_OPTIONS.has(optionKey)
        ? newValue !== 'false'
        : (newValue ?? undefined);
    this.instance.updateOptions({ [optionKey]: value } as Partial<WidgetOptions>);
  }

  sendMessage(content: string): Promise<void> {
    return this.instance?.sendMessage(content) ?? Promise.resolve();
  }

  private readOptionsFromAttributes(): WidgetOptions {
    const options: WidgetOptions = {
      onMessage: this._onMessage,
      onError: this._onError,
      initialMessages: this._initialMessages,
    };
    for (const attr of OBSERVED_ATTRS) {
      const value = this.getAttribute(attr);
      if (value === null) continue;
      const optionKey = ATTR_TO_OPTION[attr];
      (options as Record<string, unknown>)[optionKey] = NUMERIC_OPTIONS.has(optionKey)
        ? Number(value)
        : BOOLEAN_OPTIONS.has(optionKey)
          ? value !== 'false'
          : value;
    }
    return options;
  }
}
