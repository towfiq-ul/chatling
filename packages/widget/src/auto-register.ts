import { AiChatWidgetElement } from './element/AiChatWidgetElement.js';

if (!customElements.get('ai-chat-widget')) {
  customElements.define('ai-chat-widget', AiChatWidgetElement);
}

export { AiChatWidgetElement };
