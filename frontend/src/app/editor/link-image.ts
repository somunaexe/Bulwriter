import { EditorView } from 'prosemirror-view';
import { MarkType, ResolvedPos } from 'prosemirror-model';
import { screenplaySchema } from './screenplay-schema';

/** Applies the link mark to the current selection. If the selection is
 *  empty there's nothing to wrap, so the URL itself is inserted as the
 *  link's visible text instead of silently doing nothing. */
export function applyLink(view: EditorView, href: string): void {
  const linkMark = screenplaySchema.marks['link'];
  const { from, to, empty } = view.state.selection;
  let tr = view.state.tr;

  if (empty) {
    tr = tr.insertText(href, from, to).addMark(from, from + href.length, linkMark.create({ href }));
  } else {
    tr = tr.addMark(from, to, linkMark.create({ href }));
  }
  view.dispatch(tr);
  view.focus();
}

/** The exact contiguous range around $pos that carries `mark` — a click
 *  anywhere inside a link should remove the whole link, not just
 *  whatever happens to be selected. */
function markRange($pos: ResolvedPos, mark: MarkType): { from: number; to: number } | null {
  const parent = $pos.parent;
  const start = parent.childAfter($pos.parentOffset);
  if (!start.node) return null;

  const found = mark.isInSet(start.node.marks);
  if (!found) return null;

  let startIndex = $pos.index();
  let startPos = $pos.start() + start.offset;
  let endIndex = startIndex + 1;
  let endPos = startPos + start.node.nodeSize;

  while (startIndex > 0 && found.isInSet(parent.child(startIndex - 1).marks)) {
    startIndex -= 1;
    startPos -= parent.child(startIndex).nodeSize;
  }
  while (endIndex < parent.childCount && found.isInSet(parent.child(endIndex).marks)) {
    endPos += parent.child(endIndex).nodeSize;
    endIndex += 1;
  }
  return { from: startPos, to: endPos };
}

/** Removes the link mark from the current selection, or — if the
 *  selection is empty — from the whole link the cursor is sitting inside. */
export function removeLink(view: EditorView): void {
  const linkMark = screenplaySchema.marks['link'];
  const { $from, from, to, empty } = view.state.selection;

  let range = { from, to };
  if (empty) {
    const found = markRange($from, linkMark);
    if (!found) return;
    range = found;
  }

  view.dispatch(view.state.tr.removeMark(range.from, range.to, linkMark));
  view.focus();
}

/** Inserts an image node at the cursor. */
export function insertImage(view: EditorView, src: string, alt = ''): void {
  const imageType = screenplaySchema.nodes['image'];
  const { from } = view.state.selection;
  view.dispatch(view.state.tr.insert(from, imageType.create({ src, alt })));
  view.focus();
}
