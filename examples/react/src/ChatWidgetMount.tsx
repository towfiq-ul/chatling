import { mount, type WidgetOptions } from 'ai-chat-assistant-widget';
import { useEffect, useRef } from 'react';

/**
 * Thin React wrapper around the framework-agnostic `mount()`. Must be rendered
 * as a sibling of whatever subtree the router swaps on navigation — not inside
 * it — so the widget's internal state (open/closed, messages, position)
 * survives a route change instead of being torn down and remounted.
 */
export function ChatWidgetMount(options: WidgetOptions) {
  const containerRef = useRef<HTMLDivElement>(null);

  // mount() must run once, using the options present at that time — re-running it on every
  // options change would tear down and recreate the widget, losing its open/closed state,
  // messages, and position on every re-render of the parent.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-once effect, see above
  useEffect(() => {
    if (!containerRef.current) return;
    const instance = mount(containerRef.current, options);
    return () => instance.destroy();
  }, []);

  return <div ref={containerRef} />;
}
