export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface WidgetOptions {
  /** URL of the consumer's deployed Cloudflare Worker proxy. Absent -> widget renders in "not configured" mode. */
  workerUrl?: string;
  title?: string;
  placeholder?: string;
  theme?: 'light' | 'dark' | 'auto';
  initialMessages?: ChatMessage[];
  greetingMessage?: string;
  greetingDelayMs?: number;
  greetingCooldownMs?: number;
  unconfiguredMessage?: string;
  onMessage?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
}

export interface WidgetInstance {
  sendMessage(content: string): Promise<void>;
  updateOptions(options: Partial<WidgetOptions>): void;
  destroy(): void;
}

export interface ChatWidgetState {
  isOpen: boolean;
  isExpanded: boolean;
  messages: ChatMessage[];
  input: string;
  isLoading: boolean;
  error: string | null;
  position: Position;
  showGreeting: boolean;
}

export interface PanelPlacement {
  top: number;
  left: number;
  width: number;
  height: number;
}
