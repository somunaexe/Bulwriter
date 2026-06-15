import { Injectable, OnDestroy } from '@angular/core';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { ySyncPlugin, yUndoPlugin, yCursorPlugin } from 'y-prosemirror';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';

import { screenplaySchema } from '../editTools/screenplay-schema';
import { screenplayKeymap, autoUppercasePlugin } from '../editTools/screenplay-keymap';
import { elementIndicatorPlugin } from '../editTools/element-indicator.plugin';
import { environment } from '../../environments/environment';

export interface CollabSession {
  doc: Y.Doc;
  provider: WebsocketProvider;
  view: EditorView;
  destroy: () => void;
}

@Injectable({ providedIn: 'root' })
export class SyncService implements OnDestroy {
  private WS_URL = environment.wsUrl;
  private session: CollabSession | null = null;

  startSession(
    scriptId: string,
    mountEl: HTMLElement,
    // indicatorEl?: HTMLElement
  ): CollabSession {
    this.endSession();

    const ydoc = new Y.Doc();
    const yXmlFragment = ydoc.getXmlFragment('script');
    const provider = new WebsocketProvider(this.WS_URL, scriptId, ydoc);

    const plugins = [
      ySyncPlugin(yXmlFragment),
      yCursorPlugin(provider.awareness),
      yUndoPlugin(),
      screenplayKeymap(),
      autoUppercasePlugin(),
      keymap(baseKeymap),
      dropCursor(),
      gapCursor(),
    ];

    // if (indicatorEl) {
    //   plugins.push(elementIndicatorPlugin(indicatorEl));
    // }

    const state = EditorState.create({
      schema: screenplaySchema,
      plugins,
    });

    const view = new EditorView(mountEl, { state });

    this.session = {
      doc: ydoc,
      provider,
      view,
      destroy: () => {
        view.destroy();
        provider.destroy();
        ydoc.destroy();
      },
    };

    return this.session;
  }

  getContent(): string {
    return this.session?.doc.getXmlFragment('script').toString() ?? '';
  }

  endSession(): void {
    this.session?.destroy();
    this.session = null;
  }

  ngOnDestroy(): void {
    this.endSession();
  }
}