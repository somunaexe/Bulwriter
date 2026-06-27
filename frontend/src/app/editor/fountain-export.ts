import { Node as PMNode } from 'prosemirror-model';
import { ScreenplayElement } from './screenplay-schema';

/**
 * Converts a ProseMirror screenplay document into Fountain-format text.
 *
 * Walks each top-level block node, reads its `element` attribute,
 * and applies the Fountain syntax convention for that element type.
 */
export function toFountain(doc: PMNode): string {
  const lines: string[] = [];

  // doc.forEach iterates over the document's direct children —
  // each one is a block (scene heading, action, dialogue, etc.)
  doc.forEach(node => {
    const element = node.attrs['element'] as ScreenplayElement | undefined;
    const text = node.textContent; // the plain text inside this block

    if (!element || text.trim() === '') {
      lines.push(''); // preserve blank lines for spacing
      return;
    }

    switch (element) {
      case 'scene_heading':
        // Fountain recognises INT./EXT. automatically — our text
        // already includes that since auto-uppercase doesn't add it,
        // the writer types it. We just ensure a blank line before.
        lines.push('');
        lines.push(text);
        break;

      case 'action':
        lines.push(text);
        break;

      case 'character':
        // A blank line before a character cue is required in Fountain
        // to distinguish it from action text
        lines.push('');
        lines.push(text);
        break;

      case 'parenthetical':
        // Fountain requires parentheses — our schema doesn't store them,
        // so we add them if the writer didn't type them
        lines.push(text.startsWith('(') ? text : `(${text})`);
        break;

      case 'dialogue':
        lines.push(text);
        break;

      case 'transition':
        lines.push('');
        // Fountain requires transitions to be prefixed with '>' OR
        // be in ALL CAPS ending in TO: — ours are already uppercase
        // via auto-uppercase, so plain text usually suffices.
        // The '>' prefix forces Fountain to treat it as a transition
        // even if it doesn't end in "TO:".
        lines.push(`> ${text}`);
        break;
    }
  });

  // Join with newlines, collapse 3+ consecutive blank lines to 2
  // (Fountain treats double-newlines as paragraph breaks)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * Triggers a browser download of the given text as a .fountain file.
 */
export function downloadFountain(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Create a temporary <a> element to trigger the download —
  // this is the standard browser pattern for "save this string as a file"
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.fountain') ? filename : `${filename}.fountain`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release the memory used by the blob URL
  URL.revokeObjectURL(url);
}