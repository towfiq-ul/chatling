import { ChatlingElement } from './element/ChatlingElement.js';

if (!customElements.get('chatling-widget')) {
  customElements.define('chatling-widget', ChatlingElement);
}

export { ChatlingElement };
