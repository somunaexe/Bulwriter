import { Node as PMNode } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';

/** A character cue's base name, with any parenthetical extension like
 *  "(V.O.)" or "(O.S.)" stripped — same convention script-stats.ts and
 *  scene-breakdown.ts already use to group cues by character. */
function baseName(text: string): string {
  return text.replace(/\(.*?\)/g, '').trim();
}

/** Every distinct character name spoken in the script, across both
 *  regular character cues and dual-dialogue cues — the "Rename
 *  character" picker's option list. computeScriptStats' characterList
 *  is close but only covers plain 'character' nodes, not dual_dialogue. */
export function listCharacterNames(doc: PMNode): string[] {
  const names = new Set<string>();
  doc.forEach(node => {
    const element = node.attrs['element'];
    if (element !== 'character' && element !== 'dual_dialogue') return;
    const name = baseName(node.textContent);
    if (name) names.add(name);
  });
  return Array.from(names).sort();
}

/** Renames every character/dual_dialogue cue whose base name matches
 *  oldName to newName, preserving each line's own parenthetical
 *  extension (e.g. "JOHN (V.O.)" → "MIKE (V.O.)"). Matches are collected
 *  first and applied back-to-front in one transaction, same approach as
 *  find-replace.ts's replaceAll, so replacing one doesn't shift the
 *  positions of the ones still queued. Returns the number of lines
 *  changed. */
export function renameCharacter(view: EditorView, oldName: string, newName: string): number {
  const trimmedNew = newName.trim();
  if (!trimmedNew) return 0;
  const newBase = trimmedNew.toUpperCase();

  const targets: { from: number; to: number; suffix: string }[] = [];

  view.state.doc.forEach((node, offset) => {
    const element = node.attrs['element'];
    if (element !== 'character' && element !== 'dual_dialogue') return;

    const text = node.textContent;
    if (baseName(text) !== oldName) return;

    const parenMatch = text.match(/\(.*\)\s*$/);
    const suffix = parenMatch ? ` ${parenMatch[0]}` : '';
    targets.push({ from: offset + 1, to: offset + 1 + node.content.size, suffix });
  });

  if (!targets.length) return 0;

  let tr = view.state.tr;
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    tr = tr.insertText(newBase + t.suffix, t.from, t.to);
  }
  view.dispatch(tr);
  return targets.length;
}
