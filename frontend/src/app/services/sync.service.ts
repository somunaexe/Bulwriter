declare const require: any;

import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { ySyncPlugin, yUndoPlugin, yCursorPlugin, undoCommand, redoCommand } from 'y-prosemirror';
import { collabCursorBuilder, colorForUserId } from '../editor/collab-cursor';
import { EditorState, Plugin } from 'prosemirror-state';
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

  // Fires whenever the document's actual content changes (not on
  // selection-only updates) — regardless of whether the change originated
  // locally or from a remote collaborator. EditorComponent uses this to
  // flag unsaved changes; a remote-triggered false positive is a harmless,
  // conservative default (autosave will still clear it on its next tick).
  contentChanged$ = new Subject<void>();

  startSession(
    scriptId: string,
    mountEl: HTMLElement,
    indicatorEl?: HTMLElement | null,
    onElementChange?: (element: ScreenplayElement | null) => void,
    localUser?: { id: string; name: string },
  ): CollabSession {
    this.endSession();

    const ydoc = new Y.Doc();
    const yXmlFragment = ydoc.getXmlFragment('script');
    const provider = new WebsocketProvider(this.WS_URL, scriptId, ydoc);

    if (localUser) {
      provider.awareness.setLocalStateField('user', {
        name: localUser.name,
        color: colorForUserId(localUser.id),
      });
    }

    const plugins = [
      ySyncPlugin(yXmlFragment),
      yCursorPlugin(provider.awareness, { cursorBuilder: collabCursorBuilder }),
      yUndoPlugin(),
      new Plugin({
        view: () => ({
          update: (view, prevState) => {
            if (!view.state.doc.eq(prevState.doc)) this.contentChanged$.next();
          },
        }),
      }),
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
      // Order matters: destroying the view first (the old order) leaves
      // the WebSocket connection open for the brief window it takes to
      // run, so a remote update that arrives mid-teardown still gets
      // applied to the Yjs doc and can dispatch into a view that's
      // already (or about to be) torn down — "Cannot read properties of
      // null (reading 'matchesNode')" in production was exactly this.
      // Closing the socket first means no more remote updates can arrive
      // at all once teardown starts.
      destroy: () => {
        provider.destroy();
        view.destroy();
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