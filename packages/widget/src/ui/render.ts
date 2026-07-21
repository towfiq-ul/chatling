import type { ChatWidgetCore } from '../core/ChatWidgetCore.js';
import {
  computeExpandedPlacement,
  computeGreetingPlacement,
  computePanelPlacement,
} from '../core/ChatWidgetCore.js';
import type { ChatMessage } from '../core/types.js';
import { getStyleSheet } from './styles.js';

const BUBBLE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const EXPAND_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
const COLLAPSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>';

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export interface RenderHandle {
  destroy(): void;
}

export function renderWidget(root: ShadowRoot, core: ChatWidgetCore): RenderHandle {
  root.adoptedStyleSheets = [getStyleSheet()];

  const bubble = createEl('button', 'bubble');
  bubble.type = 'button';
  bubble.innerHTML = BUBBLE_ICON;
  root.appendChild(bubble);

  const greeting = createEl('div', 'greeting');
  greeting.setAttribute('role', 'status');
  greeting.hidden = true;
  const greetingText = createEl('span', 'greetingText');
  const greetingClose = createEl('button', 'greetingClose');
  greetingClose.type = 'button';
  greetingClose.setAttribute('aria-label', 'Dismiss');
  greetingClose.textContent = '✕';
  greeting.append(greetingText, greetingClose);
  root.appendChild(greeting);

  const panel = createEl('div', 'panel panelEnter');
  panel.setAttribute('role', 'dialog');
  panel.hidden = true;

  const header = createEl('div', 'panelHeader');
  const titleEl = createEl('span');
  const headerControls = createEl('div', 'headerControls');
  const expandButton = createEl('button', 'iconButton');
  expandButton.type = 'button';
  const closeButton = createEl('button', 'iconButton');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close chat');
  closeButton.innerHTML = CLOSE_ICON;
  headerControls.append(expandButton, closeButton);
  header.append(titleEl, headerControls);

  const messagesEl = createEl('div', 'messages');
  const scrollSentinel = createEl('div');

  const typingIndicator = createEl('div', 'typingIndicator');
  typingIndicator.setAttribute('aria-live', 'polite');
  typingIndicator.setAttribute('aria-label', 'Assistant is thinking');
  typingIndicator.hidden = true;
  typingIndicator.append(
    createEl('span', 'typingDot'),
    createEl('span', 'typingDot'),
    createEl('span', 'typingDot'),
  );

  const inputRow = createEl('div', 'inputRow');
  const textarea = createEl('textarea', 'input');
  textarea.rows = 1;
  const sendButton = createEl('button', 'sendButton');
  sendButton.type = 'button';
  sendButton.textContent = 'Send';
  inputRow.append(textarea, sendButton);

  panel.append(header, messagesEl, inputRow);
  root.appendChild(panel);

  bubble.addEventListener('pointerdown', (e) => {
    bubble.setPointerCapture(e.pointerId);
    core.onBubblePointerDown(e.clientX, e.clientY);
  });
  bubble.addEventListener('pointermove', (e) => {
    core.onBubblePointerMove(e.clientX, e.clientY);
  });
  bubble.addEventListener('pointerup', (e) => {
    bubble.releasePointerCapture(e.pointerId);
    core.onBubblePointerUp();
  });

  const handleResize = () => core.onViewportResize();
  window.addEventListener('resize', handleResize);

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && core.getState().isOpen) {
      core.close();
    }
  };
  window.addEventListener('keydown', handleKeydown);

  expandButton.addEventListener('click', () => core.toggleExpand());
  closeButton.addEventListener('click', () => core.close());
  greetingClose.addEventListener('click', () => core.dismissGreeting());
  greeting.addEventListener('click', (e) => {
    if (e.target === greetingClose) return;
    core.open();
  });

  textarea.addEventListener('input', () => core.setInput(textarea.value));
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void core.sendMessage();
    }
  });
  sendButton.addEventListener('click', () => {
    void core.sendMessage();
  });

  function renderMessages(messages: ChatMessage[]) {
    messagesEl.replaceChildren();
    if (messages.length === 0) {
      const empty = createEl('div', 'emptyState');
      empty.textContent = core.isConfigured()
        ? 'Ask me anything!'
        : core.getOptions().unconfiguredMessage;
      messagesEl.appendChild(empty);
    } else {
      for (const message of messages) {
        const bubbleEl = createEl(
          'div',
          `message ${message.role === 'user' ? 'messageUser' : 'messageAssistant'}`,
        );
        // LLM output is untrusted: textContent only, never innerHTML.
        bubbleEl.textContent = message.content;
        messagesEl.appendChild(bubbleEl);
      }
    }
    messagesEl.append(typingIndicator, scrollSentinel);
  }

  let wasOpen = false;
  let lastMessageCount = -1;

  function update() {
    const state = core.getState();
    const options = core.getOptions();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    bubble.hidden = state.isExpanded;
    bubble.style.left = `${state.position.x}px`;
    bubble.style.top = `${state.position.y}px`;
    bubble.setAttribute('aria-expanded', String(state.isOpen));
    bubble.setAttribute('aria-label', state.isOpen ? 'Close chat' : 'Open chat');

    titleEl.textContent = options.title;
    panel.setAttribute('aria-label', options.title);
    textarea.placeholder = options.placeholder;
    if (textarea.value !== state.input) textarea.value = state.input;
    textarea.disabled = !core.isConfigured();
    sendButton.disabled =
      !core.isConfigured() || state.isLoading || state.input.trim().length === 0;
    expandButton.innerHTML = state.isExpanded ? COLLAPSE_ICON : EXPAND_ICON;
    expandButton.setAttribute('aria-label', state.isExpanded ? 'Collapse' : 'Expand');

    const placement = state.isExpanded
      ? computeExpandedPlacement(vw, vh)
      : computePanelPlacement(state.position, vw, vh);
    panel.style.top = `${placement.top}px`;
    panel.style.left = `${placement.left}px`;
    panel.style.width = `${placement.width}px`;
    panel.style.height = `${placement.height}px`;
    panel.hidden = !state.isOpen;

    renderMessages(state.messages);
    typingIndicator.hidden = !state.isLoading;

    if (state.error) {
      const errorEl = createEl('div', 'errorText');
      errorEl.textContent = state.error;
      messagesEl.appendChild(errorEl);
    }

    if (state.showGreeting) {
      const greetingPlacement = computeGreetingPlacement(state.position, vw, vh);
      greeting.style.top = `${greetingPlacement.top}px`;
      greeting.style.left = `${greetingPlacement.left}px`;
      greetingText.textContent = options.greetingMessage;
      greeting.hidden = false;
    } else {
      greeting.hidden = true;
    }

    if (state.isOpen && !wasOpen) {
      textarea.focus();
    }

    const messagesChanged = state.messages.length !== lastMessageCount;
    lastMessageCount = state.messages.length;
    if (state.isOpen && messagesChanged) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollSentinel.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'end' });
    }

    wasOpen = state.isOpen;
  }

  const unsubscribe = core.subscribe(update);
  update();
  core.start();

  return {
    destroy() {
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeydown);
      root.replaceChildren();
    },
  };
}
