import { EditorView } from 'prosemirror-view';
import { screenplaySchema } from './screenplay-schema';

const budgetMarkType = () => screenplaySchema.marks['budget_item'];

/** Applies the budget_item mark (linking to budget.LineItem `id`) over
 *  an explicit [from, to) range — deliberately not "the current
 *  selection" like applyLink, since by the time the caller has an id to
 *  mark with (the backend has assigned one), the selection that
 *  triggered the add may no longer be live: the user's been looking at
 *  a modal in between. Callers capture the range up front instead. */
export function applyBudgetMark(view: EditorView, id: string, from: number, to: number): void {
  view.dispatch(view.state.tr.addMark(from, to, budgetMarkType().create({ id })));
}

/** The doc position of the start of the run carrying budget_item `id`,
 *  or null if it's been edited away (e.g. the marked text was deleted
 *  entirely) — jumpToBudgetMark treats that as nothing to jump to. */
export function findBudgetMarkPos(view: EditorView, id: string): number | null {
  const markType = budgetMarkType();
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (markType.isInSet(node.marks)?.attrs['id'] === id) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

/** Strips budget_item `id` from wherever it appears — a line item can
 *  only ever have been marked in one contiguous run, but edits since
 *  then could in principle have split it into more than one, so this
 *  removes every run rather than assuming just one. Scoped to each
 *  run's own [pos, pos+nodeSize) individually so a *different* budget
 *  item's mark sitting right next to it is never touched. */
export function removeBudgetMark(view: EditorView, id: string): void {
  const markType = budgetMarkType();
  let tr = view.state.tr;
  let changed = false;
  view.state.doc.descendants((node, pos) => {
    if (markType.isInSet(node.marks)?.attrs['id'] === id) {
      tr = tr.removeMark(pos, pos + node.nodeSize, markType);
      changed = true;
    }
  });
  if (changed) view.dispatch(tr);
}
