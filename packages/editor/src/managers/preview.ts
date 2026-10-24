import { createIframeMessenger, type TypedMessage, type WindowMessenger } from '@craftile/messenger';
import type { WindowMessages } from '@craftile/types';

export interface PreviewState {
  previewUrl: string;
  previewFrame: HTMLIFrameElement | null;
  isIframeReady: boolean;
  messageQueue: TypedMessage[];
}

export class PreviewManager {
  public readonly state: PreviewState;
  private messenger!: WindowMessenger<WindowMessages>;
  private previewOrigin?: string;
  private readyCallbacks: Array<() => void> = [];
  private documentReadyCallbacks: Array<() => void> = [];

  /**
   * @param previewOrigin Origin of the preview document. When set, messages are only posted
   * to and accepted from that origin; otherwise any origin is used (same-window previews).
   */
  constructor(previewOrigin?: string) {
    this.previewOrigin = previewOrigin;
    this.state = reactive({
      previewUrl: 'about:blank',
      previewFrame: null,
      isIframeReady: false,
      messageQueue: [],
    });
  }

  loadUrl(url: string): void {
    this.state.previewUrl = url;
  }

  loadFromHtml(html: string): void {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    this.state.previewUrl = url;

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  reload(): void {
    if (this.state.previewFrame) {
      this.state.previewFrame.contentWindow?.location.reload();
    }
  }

  getFrame(): HTMLIFrameElement | null {
    return this.state.previewFrame;
  }

  _registerFrame(frame: HTMLIFrameElement): void {
    this.state.previewFrame = frame;
    this.state.isIframeReady = false;
    this.messenger = this.previewOrigin
      ? createIframeMessenger(frame, this.previewOrigin, { allowedOrigins: [this.previewOrigin] })
      : createIframeMessenger(frame);

    // Every messenger needs its own ready listener: a re-registered frame gets a new one.
    this.messenger.listen('craftile.preview.ready', () => {
      this.state.isIframeReady = true;
      this.runReadyCallbacks();
      this.runDocumentReadyCallbacks();
      this.flushMessageQueue();
    });
  }

  sendMessage<T extends keyof WindowMessages>(type: T, payload?: WindowMessages[T]) {
    if (this.state.isIframeReady) {
      this.messenger.send(type, payload);
    } else {
      this.state.messageQueue.push({ type, payload });
    }
  }

  onMessage<T extends keyof WindowMessages>(type: T, handler: (data: WindowMessages[T], event: MessageEvent) => void) {
    return this.messenger.listen(type, handler);
  }

  onReady(fn: () => void) {
    this.readyCallbacks.push(fn);
  }

  onDocumentReady(fn: () => void) {
    this.documentReadyCallbacks.push(fn);
  }

  runReadyCallbacks() {
    this.readyCallbacks.forEach((cb) => cb.call(this));
    this.readyCallbacks = [];
  }

  runDocumentReadyCallbacks() {
    this.documentReadyCallbacks.forEach((cb) => cb.call(this));
  }

  private flushMessageQueue(): void {
    if (this.state.isIframeReady && this.state.previewFrame?.contentWindow) {
      while (this.state.messageQueue.length > 0) {
        const message = this.state.messageQueue.shift()!;
        this.messenger.send(message.type as keyof WindowMessages, message.payload);
      }
    }
  }
}
