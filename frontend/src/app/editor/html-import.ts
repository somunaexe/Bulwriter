import { Node as PMNode, DOMParser as PMDOMParser } from 'prosemirror-model';
import { screenplaySchema } from './screenplay-schema';
import { parseFountain } from './fountain-import';
import { fountainToPMDoc } from './fountain-import';

const BLOCK_SELECTOR = 'p, div, h1, h2, h3, h4, h5, h6, li';

/** Imports an HTML file as a full screenplay document — two paths:
 *
 *  1. A Bulwriter-exported file (or anything using the same convention)
 *     carries our own data-element attributes on its <p> tags, which is
 *     exactly what the schema's parseDOM rules match — parsed directly
 *     against the schema via ProseMirror's own DOMParser, losslessly,
 *     no heuristics involved.
 *  2. Arbitrary HTML has no such markup, so it falls back to extracting
 *     plain text and feeding it through the same Fountain-style
 *     heuristic parser (parseFountain) that Fountain/DOC/PDF import use. */
export async function importScreenplayHtml(file: File): Promise<PMNode> {
  const raw = await file.text();
  const dom = new DOMParser().parseFromString(raw, 'text/html');

  if (dom.querySelector('[data-element]')) {
    return PMDOMParser.fromSchema(screenplaySchema).parse(dom.body);
  }

  return fountainToPMDoc(parseFountain(extractPlainText(dom)));
}

function extractPlainText(dom: Document): string {
  const blocks = Array.from(dom.body.querySelectorAll(BLOCK_SELECTOR));
  if (blocks.length === 0) return dom.body.textContent || '';

  const lines: string[] = [];
  for (const el of blocks) {
    // Skip a block that itself contains other blocks (a wrapping <div>,
    // say) — its text is already covered by walking those children,
    // counting it here too would duplicate every line inside it.
    if (el.querySelector(BLOCK_SELECTOR)) continue;

    const text = (el.textContent || '').trim();
    lines.push(text);

    // parseFountain treats a short ALL CAPS line as a character cue only
    // when blank-line-before and non-blank-text-after, then collects
    // every following non-blank line as that cue's dialogue until it
    // hits a blank one. A blank line inserted here — between a cue and
    // its own dialogue — breaks that detection entirely (the cue and
    // its line both fall back to plain action text instead), so this
    // is deliberately the one place a separator is skipped.
    const looksLikeCue = text.length > 0 && text.length <= 40 && text === text.toUpperCase() && /[A-Z]/.test(text);
    if (!looksLikeCue) lines.push('');
  }

  return lines.join('\n');
}
