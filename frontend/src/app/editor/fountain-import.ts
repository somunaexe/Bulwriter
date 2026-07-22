import { screenplaySchema, ScreenplayElement } from './screenplay-schema';
import { Node as PMNode } from 'prosemirror-model';

interface ParsedLine {
  element: ScreenplayElement;
  text: string;
}

interface InlineRun {
  text: string;
  marks: string[];
}

// Placeholder codepoints used to protect backslash-escaped markers
// (\* \_) while we scan for real emphasis delimiters.
const ESCAPED_STAR = '\u0001';
const ESCAPED_USCORE = '\u0002';

/**
 * Parses Fountain's inline emphasis syntax into styled text runs:
 *   *italic*, **bold**, ***bold italic***, _underline_
 * Delimiters are matched left-to-right, longest first, against the
 * next occurrence of the same delimiter — this covers the common,
 * non-nested case that makes up the vast majority of real scripts.
 * A backslash escapes a literal `*` or `_` (\* \_).
 */
function parseInlineFountain(raw: string): InlineRun[] {
  const text = raw.replace(/\\\*/g, ESCAPED_STAR).replace(/\\_/g, ESCAPED_USCORE);
  const runs: InlineRun[] = [];
  let buffer = '';
  let i = 0;

  const unescape = (s: string) =>
    s.replace(new RegExp(ESCAPED_STAR, 'g'), '*').replace(new RegExp(ESCAPED_USCORE, 'g'), '_');
  const flush = () => {
    if (buffer) runs.push({ text: unescape(buffer), marks: [] });
    buffer = '';
  };

  while (i < text.length) {
    let matched = false;
    for (const [delim, marks] of [
      ['***', ['strong', 'em']],
      ['**', ['strong']],
      ['*', ['em']],
      ['_', ['underline']],
    ] as [string, string[]][]) {
      if (text.startsWith(delim, i)) {
        const close = text.indexOf(delim, i + delim.length);
        if (close !== -1 && close > i + delim.length) {
          flush();
          runs.push({ text: unescape(text.slice(i + delim.length, close)), marks });
          i = close + delim.length;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      buffer += text[i];
      i++;
    }
  }
  flush();

  return runs.filter(r => r.text.length > 0);
}

export function parseFountain(fountain: string): ParsedLine[] {
  const rawLines = fountain.split('\n');
  const lines = rawLines.map(l => l.trimEnd());
  const parsed: ParsedLine[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : null;
    const next = i < lines.length - 1 ? lines[i + 1] : null;

    if (line.trim() === '') { i++; continue; }

    if (line.startsWith('~')) {
      // Standard Fountain only requires a leading '~', but be lenient
      // about a symmetric '~text~' some tools/exports produce.
      let lyric = line.slice(1).trim();
      if (lyric.endsWith('~')) lyric = lyric.slice(0, -1).trim();
      parsed.push({ element: 'lyrics', text: lyric });
      i++; continue;
    }

    if (line.trim().startsWith('[[') && line.trim().endsWith(']]')) {
      const inner = line.trim();
      parsed.push({ element: 'note', text: inner.slice(2, -2).trim() });
      i++; continue;
    }

    if (line.startsWith('.') && !line.startsWith('..')) {
      parsed.push({ element: 'scene_heading', text: line.slice(1).trim() });
      i++; continue;
    }

    if (/^(INT|EXT|INT\.\/EXT|I\/E|EST)[\.\s]/i.test(line)) {
      parsed.push({ element: 'scene_heading', text: line.toUpperCase() });
      i++; continue;
    }

    if (line.startsWith('>') && !line.endsWith('<')) {
      parsed.push({ element: 'transition', text: line.slice(1).trim() });
      i++; continue;
    }

    if (/\sTO:$/.test(line) && line === line.toUpperCase()) {
      parsed.push({ element: 'transition', text: line });
      i++; continue;
    }

    if (line.trim().startsWith('(') && line.trim().endsWith(')')) {
      parsed.push({ element: 'parenthetical', text: line.trim() });
      i++; continue;
    }

    const isAllCaps = line.trim() === line.trim().toUpperCase() && /[A-Z]/.test(line);
    const prevIsBlank = prev === null || prev.trim() === '';
    const nextIsText = next !== null && next.trim() !== '';

    if (isAllCaps && prevIsBlank && nextIsText) {
      // A trailing '^' marks a dual-dialogue cue.
      const isDual = line.trim().endsWith('^');
      const withoutDual = isDual ? line.trim().slice(0, -1).trim() : line;
      const charName = withoutDual.replace(/\s*\(.*?\)\s*$/, '').trim();
      parsed.push({ element: isDual ? 'dual_dialogue' : 'character', text: charName });
      i++;

      while (i < lines.length && lines[i].trim() !== '') {
        const dLine = lines[i];
        if (dLine.trim().startsWith('(') && dLine.trim().endsWith(')')) {
          parsed.push({ element: 'parenthetical', text: dLine.trim() });
        } else {
          parsed.push({ element: 'dialogue', text: dLine.trim() });
        }
        i++;
      }
      continue;
    }

    parsed.push({ element: 'action', text: line });
    i++;
  }

  return parsed;
}

export function fountainToPMDoc(parsed: ParsedLine[]): PMNode {
  const nodes = parsed
    .filter(p => p.text.trim() !== '')
    .map(p => {
      const nodeType = (screenplaySchema.nodes as any)[p.element];
      const runs = parseInlineFountain(p.text);
      const inline = runs.map(r => {
        const marks = r.marks.map(m => (screenplaySchema.marks as any)[m].create());
        return screenplaySchema.text(r.text, marks);
      });
      return nodeType.create({ element: p.element }, inline.length ? inline : []);
    });

  if (nodes.length === 0) {
    const action = screenplaySchema.nodes['action'];
    nodes.push(action.create({ element: 'action' }));
  }

  return screenplaySchema.nodes['doc'].create({}, nodes);
}