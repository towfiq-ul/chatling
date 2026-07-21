const CSS = /* css */ `
:host {
  --chatling-primary-color: #2563eb;
  --chatling-primary-color-hover: #1d4ed8;
  --chatling-surface-color: #ffffff;
  --chatling-text-color: #111827;
  --chatling-muted-text-color: #6b7280;
  --chatling-border-color: #e5e7eb;
  --chatling-font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  --chatling-bubble-size: 60px;
  --chatling-z-index: 2147483000;

  all: initial;
  font-family: var(--chatling-font-family);
  color-scheme: light;
}

:host([data-theme="dark"]) {
  --chatling-surface-color: #1f2937;
  --chatling-text-color: #f9fafb;
  --chatling-muted-text-color: #9ca3af;
  --chatling-border-color: #374151;
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

/*
 * Every hidden-toggled element below also sets its own "display" (flex, in
 * each case) for its visible state, which otherwise beats the UA stylesheet's
 * [hidden] { display: none } rule once an author stylesheet touches display
 * on the same element — so the hidden attribute alone wouldn't actually hide
 * anything. This makes hidden win unconditionally.
 */
[hidden] {
  display: none !important;
}

.bubble {
  position: fixed;
  width: var(--chatling-bubble-size);
  height: var(--chatling-bubble-size);
  border-radius: 50%;
  border: none;
  background: var(--chatling-primary-color);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  z-index: var(--chatling-z-index);
  touch-action: none;
  transition: transform 0.15s ease, background 0.15s ease;
}

.bubble.notDraggable {
  cursor: pointer;
  touch-action: auto;
}

.bubble:hover {
  transform: scale(1.05);
  background: var(--chatling-primary-color-hover);
}

.bubble svg {
  width: 28px;
  height: 28px;
  pointer-events: none;
}

.panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--chatling-surface-color);
  color: var(--chatling-text-color);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: var(--chatling-z-index);
  transition: top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease;
}

.panelHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--chatling-border-color);
  font-weight: 600;
  flex-shrink: 0;
}

.headerControls {
  display: flex;
  gap: 4px;
}

.iconButton {
  border: none;
  background: transparent;
  color: var(--chatling-muted-text-color);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.iconButton:hover {
  background: var(--chatling-border-color);
}

.iconButton svg {
  width: 18px;
  height: 18px;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.messageUser {
  align-self: flex-end;
  background: var(--chatling-primary-color);
  color: #fff;
  border-bottom-right-radius: 2px;
}

.messageAssistant {
  align-self: flex-start;
  background: var(--chatling-border-color);
  color: var(--chatling-text-color);
  border-bottom-left-radius: 2px;
}

.emptyState,
.errorText {
  font-size: 13px;
  color: var(--chatling-muted-text-color);
  padding: 8px 4px;
}

.errorText {
  color: #dc2626;
}

.typingIndicator {
  display: flex;
  gap: 4px;
  align-self: flex-start;
  padding: 8px 12px;
}

.typingDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--chatling-muted-text-color);
  animation: chatling-typing-bounce 1.2s infinite ease-in-out;
}

.typingDot:nth-child(2) {
  animation-delay: 0.15s;
}

.typingDot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes chatling-typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
}

.inputRow {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--chatling-border-color);
  flex-shrink: 0;
}

.input {
  flex: 1;
  resize: none;
  border: 1px solid var(--chatling-border-color);
  border-radius: 8px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 14px;
  color: var(--chatling-text-color);
  background: var(--chatling-surface-color);
  max-height: 96px;
}

.input:focus {
  outline: 2px solid var(--chatling-primary-color);
  outline-offset: -1px;
}

.sendButton {
  border: none;
  background: var(--chatling-primary-color);
  color: #fff;
  border-radius: 8px;
  padding: 0 14px;
  cursor: pointer;
  font-weight: 600;
}

.sendButton:hover {
  background: var(--chatling-primary-color-hover);
}

.sendButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.greeting {
  position: fixed;
  background: var(--chatling-surface-color);
  color: var(--chatling-text-color);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  padding: 10px 14px;
  font-size: 13px;
  z-index: var(--chatling-z-index);
  display: flex;
  align-items: flex-start;
  gap: 8px;
  animation: chatling-fade-in 0.2s ease;
}

.greetingText {
  flex: 1;
}

.greetingClose {
  border: none;
  background: transparent;
  color: var(--chatling-muted-text-color);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}

@keyframes chatling-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.panelEnter {
  animation: chatling-fade-in 0.15s ease;
}

@media (prefers-reduced-motion: reduce) {
  .bubble,
  .bubble:hover,
  .panel {
    transition: none;
    transform: none;
  }

  .typingDot {
    animation: none;
    opacity: 0.5;
  }

  .greeting,
  .panelEnter {
    animation: none;
  }
}
`;

let cachedSheet: CSSStyleSheet | null = null;

export function getStyleSheet(): CSSStyleSheet {
  if (!cachedSheet) {
    cachedSheet = new CSSStyleSheet();
    cachedSheet.replaceSync(CSS);
  }
  return cachedSheet;
}
