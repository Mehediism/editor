export interface TypedMessage<T = any> {
  type: string;
  payload: T | undefined;
}

export interface WindowMessengerOptions {
  /**
   * Origins allowed to send messages to this messenger. Defaults to any origin, but
   * messages are always restricted to the window we talk to (see `handleMessage`).
   */
  allowedOrigins?: string[];
}

export class WindowMessenger<Messages extends Record<string, any>> {
  private handlers = new Map<keyof Messages, Function[]>();
  private targetWindow: Window;
  private targetOrigin: string;
  private allowedOrigins?: string[];
  private fallbackHandler?: (data: any, event: MessageEvent) => void;

  constructor(targetWindow: Window, targetOrigin: string = '*', options: WindowMessengerOptions = {}) {
    this.targetWindow = targetWindow;
    this.targetOrigin = targetOrigin;
    this.allowedOrigins = options.allowedOrigins;
    window.addEventListener('message', this.handleMessage.bind(this));
  }

  private handleMessage(event: MessageEvent) {
    // Only the window on the other end of this channel may talk to us. Without this
    // check any frame or opener could drive the editor or the preview.
    if (event.source !== this.targetWindow) {
      return;
    }

    if (this.allowedOrigins && !this.allowedOrigins.includes(event.origin)) {
      return;
    }

    const message = event.data as TypedMessage;

    if (!message || !message.type) {
      return;
    }

    const handlers = this.handlers.get(message.type);

    if (handlers) {
      handlers.forEach((handler) => handler(message.payload, event));
    } else if (this.fallbackHandler) {
      this.fallbackHandler(event.data, event);
    }
  }

  send<K extends keyof Messages>(type: K, payload?: Messages[K]): void {
    const message: TypedMessage<Messages[K]> = { type: type as string, payload };
    this.targetWindow.postMessage(message, this.targetOrigin);
  }

  listen<K extends keyof Messages>(type: K, handler: (data: Messages[K], event: MessageEvent) => void): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }

    this.handlers.get(type)!.push(handler);

    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  registerFallbackHandler(handler: (data: any, event: MessageEvent) => void) {
    this.fallbackHandler = handler;
  }
}

export function createIframeMessenger<T extends Record<string, any>>(
  iframe: HTMLIFrameElement,
  targetOrigin = '*',
  options?: WindowMessengerOptions
) {
  return new WindowMessenger<T>(iframe.contentWindow!, targetOrigin, options);
}

export function createParentMessenger<T extends Record<string, any>>(
  targetOrigin = '*',
  options?: WindowMessengerOptions
) {
  if (window.parent === window) {
    throw new Error('Not inside an iframe');
  }

  return new WindowMessenger<T>(window.parent, targetOrigin, options);
}
