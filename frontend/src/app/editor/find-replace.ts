import { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';

export interface FindMatch {
  from: number;
  to: number;
}

/**
 * Every occurrence of `term` across the document's text nodes, in
 * document order. Matches are found per text node (not across node
 * boundaries) — screenplay blocks are short paragraph-like units, so a
 * search term spanning two of them is not a real-world case worth the
 * extra complexity of stitching adjacent text nodes together.
 */
export function findAll(view: EditorView, term: string, matchCase: boolean): FindMatch[] {
  if (!term) return [];
  const matches: FindMatch[] = [];
  const needle = matchCase ? term : term.toLowerCase();

  view.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const haystack = matchCase ? node.text : node.text.toLowerCase();

    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + needle.length });
      idx = haystack.indexOf(needle, idx + 1);
    }
  });

  return matches;
}

/** Selects a match and scrolls it into view — this IS the "highlight",
 *  since a ProseMirror selection renders as the browser's native text
 *  selection, no separate decoration layer needed. */
export function selectMatch(view: EditorView, match: FindMatch): void {
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

/** Replaces one match, keeping the cursor positioned right after the
 *  replacement text. */
export function replaceMatch(view: EditorView, match: FindMatch, replacement: string): void {
  const tr = view.state.tr.insertText(replacement, match.from, match.to);
  view.dispatch(tr.scrollIntoView());
}

/** Replaces every occurrence in a single transaction. Matches are
 *  applied back-to-front so replacing one doesn't shift the positions
 *  of the ones still queued. */
export function replaceAll(view: EditorView, term: string, replacement: string, matchCase: boolean): number {
  const matches = findAll(view, term, matchCase);
  if (!matches.length) return 0;

  let tr = view.state.tr;
  for (let i = matches.length - 1; i >= 0; i--) {
    tr = tr.insertText(replacement, matches[i].from, matches[i].to);
  }
  view.dispatch(tr);
  return matches.length;
}
