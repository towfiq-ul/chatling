import { renderWidget } from '../ui/render.js';
import { ChatWidgetCore } from './ChatWidgetCore.js';
import type { WidgetInstance, WidgetOptions } from './types.js';

export function mount(target: HTMLElement, options: WidgetOptions = {}): WidgetInstance {
  const shadowRoot = target.shadowRoot ?? target.attachShadow({ mode: 'open' });
  const core = new ChatWidgetCore(options);
  const renderHandle = renderWidget(shadowRoot, core);

  return {
    sendMessage: (content: string) => core.sendMessage(content),
    updateOptions: (partial) => core.updateOptions(partial),
    destroy: () => {
      renderHandle.destroy();
      core.destroy();
    },
  };
}
