declare const require: any;

import { Injectable, OnDestroy } from '@angular/core';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { ySyncPlugin, yUndoPlugin, yCursorPlugin, undoCommand, redoCommand } from 'y-prosemirror';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';

import { screenplaySchema, ScreenplayElement } from '../editor/screenplay-schema';
import { screenplayKeymap, autoUppercasePlugin } from '../editor/screenplay-keymap';
import { elementIndicatorPlugin } from '../editor/element-indicator.plugin';
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
    indicatorEl?: HTMLElement | null,
    onElementChange?: (element: ScreenplayElement | null) => void,
  ): CollabSession {
    this.endSession();

    const ydoc = new Y.Doc();
    const yXmlFragment = ydoc.getXmlFragment('script');
    const provider = new WebsocketProvider(this.WS_URL, scriptId, ydoc);

    const plugins = [
      ySyncPlugin(yXmlFragment),
      yCursorPlugin(provider.awareness),
      yUndoPlugin(),
      // Yjs's UndoManager (wired up by yUndoPlugin above) tracks the
      // history — prosemirror-history isn't used at all here, since it
      // doesn't cooperate with a collaboratively-edited Yjs doc. Mod-Z/
      // Mod-Y are the only bindings yUndoPlugin doesn't wire up itself.
      keymap({
        'Mod-z': undoCommand,
        'Mod-y': redoCommand,
        'Mod-Shift-z': redoCommand,
      }),
      screenplayKeymap(),
      autoUppercasePlugin(),
      keymap(baseKeymap),
      dropCursor(),
      gapCursor(),
    ];

    if (indicatorEl || onElementChange) {
      plugins.push(elementIndicatorPlugin(indicatorEl ?? null, onElementChange));
    }

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
    const view = (this as any).session?.view;
    if (!view) return '';

    // Import toFountain dynamically to avoid circular deps
    const { toFountain } = require('../editor/fountain-export');
    return toFountain(view.state.doc);
  }

  // The current ProseMirror document — for features that need to walk
  // the doc's structure directly (e.g. scene breakdown) rather than the
  // Fountain text getContent() produces.
  getDoc(): PMNode | null {
    return this.session?.view.state.doc ?? null;
  }

  endSession(): void {
    this.session?.destroy();
    this.session = null;
  }

  ngOnDestroy(): void {
    this.endSession();
  }
}