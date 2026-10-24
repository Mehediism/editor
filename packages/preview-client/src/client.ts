import type { Block, WindowMessages } from '@craftile/types';
import { createParentMessenger, WindowMessenger } from '@craftile/messenger';
import { EventBus } from '@craftile/event-bus';
import { Inspector } from './inspector';

export interface PreviewClientEvents extends WindowMessages {
  [event: string]: any;

  'block.select': {
    blockId: string;
    block?: Block;
    blockType?: string;
    element: HTMLElement;
  };

  'block.deselect': {
    blockId: string;
    block?: Block;
    blockType?: string;
    element: HTMLElement;
  };
}

export interface PreviewClientOptions {
  /**
   * Origin of the editor window that embeds this preview. Required when the editor and
   * the preview are served from different origins; defaults to the preview's own origin.
   */
  editorOrigin?: string;
}

export class PreviewClient extends EventBus<PreviewClientEvents> {
  private messenger: WindowMessenger<WindowMessages>;
  private blocks = new Map<string, Block>();
  public inspector: Inspector;

  constructor(options: PreviewClientOptions = {}) {
    super();

    const editorOrigin = options.editorOrigin ?? window.origin;
    this.messenger = createParentMessenger(editorOrigin, { allowedOrigins: [editorOrigin] });
    this.inspector = new Inspector(this.messenger, this);

    this.initialize();
  }

  private initialize() {
    const announceReady = () => {
      this.messenger.send('craftile.preview.ready', {});

      setTimeout(() => {
        this.sendPageData();
      }, 0);
    };

    // Client-rendered previews (React, Vue...) usually create the client after the load
    // event has already fired, so waiting for it would never announce readiness.
    if (document.readyState === 'complete') {
      announceReady();
    } else {
      window.addEventListener('load', announceReady, { once: true });
    }

    // The editor pings when it (re)registers this frame; answer so it never misses `ready`.
    this.messenger.listen('craftile.editor.ping', () => {
      this.messenger.send('craftile.preview.ready', {});
    });

    this.messenger.listen('craftile.editor.updates', (payload) => {
      this.updateBlocks(payload);
      this.emit('craftile.editor.updates', payload);
    });

    this.messenger.registerFallbackHandler((data: any) => {
      const { type, payload } = data;
      this.emit(type, payload);
    });
  }

  getBlock(blockId: string): Block | undefined {
    return this.blocks.get(blockId);
  }

  private updateBlocks(updates: WindowMessages['craftile.editor.updates']): void {
    for (const [blockId, block] of Object.entries(updates.blocks)) {
      this.blocks.set(blockId, block);
    }

    for (const blockId of updates.changes.removed) {
      this.blocks.delete(blockId);
    }
  }

  private sendPageData() {
    const pageDataElement = document.getElementById('page-data');

    if (!pageDataElement) {
      return;
    }

    try {
      const pageData = JSON.parse(pageDataElement.textContent || '{}');
      this.blocks.clear();

      for (const [blockId, block] of Object.entries(pageData.content.blocks || {}) as [string, Block][]) {
        this.blocks.set(blockId, block);
      }

      this.messenger.send('craftile.preview.page-data', { pageData });
    } catch (error) {
      console.error('Failed to parse page data:', error);
    }
  }
}
