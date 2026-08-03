import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { computePageBreaks } from './pagination';

export const paginationPluginKey = new PluginKey<DecorationSet>('pagination');

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations = computePageBreaks(doc).map(({ pos, pageNumber }) =>
    Decoration.widget(
      pos,
      () => {
        const el = document.createElement('div');
        el.className = 'page-break';
        if (pageNumber != null) {
          const label = document.createElement('span');
          label.className = 'page-break-number';
          label.textContent = `${pageNumber}.`;
          el.appendChild(label);
        }
        return el;
      },
      { side: -1 }, // render before the block at `pos`, not after it
    )
  );
  return DecorationSet.create(doc, decorations);
}

/** Renders a page-break gap + page number between blocks wherever
 *  computePageBreaks (pagination.ts) says a printed page would end — pure
 *  rendering, never touches the document Yjs syncs. Recomputed whenever
 *  the doc actually changes; skipped for selection-only transactions
 *  (cursor moves, remote awareness updates), which are by far the more
 *  frequent kind and don't change where anything breaks. */
export function paginationPlugin(): Plugin {
  return new Plugin({
    key: paginationPluginKey,
    state: {
      init(_config, state: EditorState) {
        return buildDecorations(state.doc);
      },
      apply(tr: Transaction, old: DecorationSet, _oldState: EditorState, newState: EditorState) {
        if (!tr.docChanged) return old.map(tr.mapping, tr.doc);
        return buildDecorations(newState.doc);
      },
    },
    props: {
      decorations(state: EditorState) {
        return paginationPluginKey.getState(state);
      },
    },
  });
}
