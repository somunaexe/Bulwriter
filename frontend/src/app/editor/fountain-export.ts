import { Node as PMNode } from 'prosemirror-model';
import { ScreenplayElement } from './screenplay-schema';

/**
 * Escapes literal `*` / `_` in plain text so they survive a round trip
 * without being mistaken for Fountain emphasis markers on re-import.
 */
function escapeFountainInline(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/_/g, '\\_');
}

/**
 * Serializes a block node's inline content (text + strong/em/underline
 * marks) into Fountain's emphasis syntax: *italic*, **bold**,
 * ***bold italic***, _underline_.
 */
function serializeInline(node: PMNode): string {
  let out = '';
  node.forEach(child => {
    let seg = escapeFountainInline(child.text ?? '');
    const markNames = child.marks.map(m => m.type.name);
    const hasStrong = markNames.includes('strong');
    const hasEm = markNames.includes('em');
    const hasUnderline = markNames.includes('underline');

    if (hasStrong && hasEm) seg = `***${seg}***`;
    else if (hasStrong) seg = `**${seg}**`;
    else if (hasEm) seg = `*${seg}*`;

    if (hasUnderline) seg = `_${seg}_`;

    out += seg;
  });
  return out;
}

/**
 * Converts a ProseMirror screenplay document into Fountain-format text.
 *
 * Walks each top-level block node, reads its `element` attribute,
 * and applies the Fountain syntax convention for that element type.
 */
export function toFountain(doc: PMNode): string {
  const lines: string[] = [];

  // Split off a leading run of title_page_field nodes (Title/Credit/
  // Author/etc.) — Fountain title pages are 'Key: value' lines at the
  // very top of the file, followed by a blank line and '==='.
  const children: PMNode[] = [];
  doc.forEach(n => children.push(n));

  let bodyStart = 0;
  while (bodyStart < children.length && children[bodyStart].attrs['element'] === 'title_page_field') {
    bodyStart++;
  }
  const titleNodes = children.slice(0, bodyStart);
  const bodyNodes = children.slice(bodyStart);

  const titleFields = titleNodes
    .map(n => ({ key: String(n.attrs['key'] || 'Title'), value: serializeInline(n) }))
    .filter(f => f.value.trim() !== '');

  if (titleFields.length > 0) {
    for (const f of titleFields) lines.push(`${f.key}: ${f.value}`);
    lines.push('');
    lines.push('===');
    lines.push('');
  }

  // Walk the remaining top-level blocks (scene heading, action, dialogue, etc.)
  bodyNodes.forEach(node => {
    const element = node.attrs['element'] as ScreenplayElement | undefined;
    const plainText = node.textContent; // used for structural checks (blank/paren detection)

    if (!element || plainText.trim() === '') {
      lines.push(''); // preserve blank lines for spacing
      return;
    }

    const text = serializeInline(node); // marked-up text actually written out

    switch (element) {
      case 'scene_heading': {
        // Fountain recognises INT./EXT./EST./I-E automatically. Anything
        // else (a forced heading the writer typed via a leading '.') needs
        // that '.' re-added on export — otherwise re-importing the file
        // won't recognise it as a scene heading any more.
        lines.push('');
        const looksLikeSlug = /^(INT|EXT|INT\.\/EXT|I\/E|EST)[\.\s]/i.test(plainText);
        lines.push(looksLikeSlug ? text : `.${text}`);
        break;
      }

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
        lines.push(plainText.startsWith('(') ? text : `(${text})`);
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

      case 'shot':
      case 'sequence_heading':
        // Treated like a heading — its own line, set off by blank lines.
        lines.push('');
        lines.push(text);
        break;

      case 'lyrics':
        // Fountain's lyric syntax: each line prefixed with '~'.
        lines.push(`~${text}`);
        break;

      case 'dual_dialogue':
        // Fountain marks a dual-dialogue cue with a trailing '^' on the
        // second character's line.
        lines.push('');
        lines.push(`${text} ^`);
        break;

      case 'note':
        // Fountain's boneyard/note syntax.
        lines.push(`[[${text}]]`);
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