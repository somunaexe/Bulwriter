import { Injectable, OnDestroy } from '@angular/core';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { ySyncPlugin, yUndoPlugin, yCursorPlugin } from 'y-prosemirror';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from 'prosemirror-schema-basic';
import { keymap } from 'prosemirror-keymap';
import { history } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
// import { exampleSetup } from 'prosemirror-example-setup';

export interface CollabSession {
  doc: Y.Doc;
  provider: WebsocketProvider;
  view: EditorView;
  destroy: () => void;
}

@Injectable({ providedIn: 'root' })
export class SyncService implements OnDestroy {
  private WS_URL = 'ws://localhost:8080/ws';
  private session: CollabSession | null = null;

  /**
   * Mounts a collaborative ProseMirror editor into `mountEl`.
   * scriptId becomes the Yjs room name — all clients with the same
   * scriptId share one live document via the Go WebSocket hub.
   */
  startSession(scriptId: string, mountEl: HTMLElement): CollabSession {
    this.endSession();

    const ydoc = new Y.Doc();
    const yXmlFragment = ydoc.getXmlFragment('script');

    const provider = new WebsocketProvider(this.WS_URL, scriptId, ydoc);

    const state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(yXmlFragment),
        yCursorPlugin(provider.awareness),
        yUndoPlugin(),
        history(),
        keymap(baseKeymap),
        dropCursor(),
        gapCursor(),
      ],
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

  /** Returns the current plain-text content of the shared document. */
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
