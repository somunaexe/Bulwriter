import { screenplaySchema, ScreenplayElement } from './screenplay-schema';
import { Node as PMNode } from 'prosemirror-model';

interface ParsedLine {
  element: ScreenplayElement;
  text: string;
  key?: string; // only set for element === 'title_page_field'
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

const TITLE_PAGE_KEY = /^[A-Za-z][A-Za-z0-9 ]*:\s*(.*)$/;

/**
 * Strips a leading Fountain title page — a run of `Key: value` pairs
 * (Title, Credit, Author, Draft date, etc.), optionally with indented
 * continuation lines, ending at a blank line and an optional '===' page
 * break. Title pages are metadata, not screenplay body content, so they
 * must not be imported as action paragraphs.
 */
interface TitleField { key: string; value: string; }
interface TitlePageResult { fields: TitleField[]; rest: string[]; }

function stripTitlePage(lines: string[]): TitlePageResult {
  let i = 0;
  if (i >= lines.length || !TITLE_PAGE_KEY.test(lines[i])) return { fields: [], rest: lines };

  const fields: TitleField[] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      // A blank line only ends the title page if nothing after it looks
      // like another key/value pair — title pages may have blank lines
      // between entries.
      const rest = lines.slice(i + 1).find(l => l.trim() !== '');
      if (rest && TITLE_PAGE_KEY.test(rest)) { i++; continue; }
      break;
    }
    const kv = line.match(TITLE_PAGE_KEY);
    if (kv) {
      fields.push({ key: line.slice(0, line.indexOf(':')).trim(), value: kv[1].trim() });
      i++;
      continue;
    }
    if (/^[ \t]/.test(line) && fields.length > 0) {
      // Indented continuation line — append to the previous field's value.
      fields[fields.length - 1].value =
        (fields[fields.length - 1].value + ' ' + line.trim()).trim();
      i++;
      continue;
    }
    break;
  }

  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && lines[i].trim() === '===') {
    i++;
    while (i < lines.length && lines[i].trim() === '') i++;
  }

  return { fields, rest: lines.slice(i) };
}

export function parseFountain(fountain: string): ParsedLine[] {
  const rawLines = fountain.split('\n');
  const { fields, rest } = stripTitlePage(rawLines.map(l => l.trimEnd()));
  const lines = rest;
  const parsed: ParsedLine[] = fields.map(f => ({
    element: 'title_page_field' as const,
    text: f.value,
    key: f.key,
  }));

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
      parsed.push({ element: 'scene', text: line.slice(1).trim() });
      i++; continue;
    }

    if (/^(INT|EXT|INT\.\/EXT|I\/E|EST)[\.\s]/i.test(line)) {
      parsed.push({ element: 'scene', text: line.toUpperCase() });
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
      // Parentheses are chrome (added back on display/export), not
      // content — store just the inner text.
      const trimmed = line.trim();
      parsed.push({ element: 'parenthetical', text: trimmed.slice(1, -1).trim() });
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
          const trimmed = dLine.trim();
          parsed.push({ element: 'parenthetical', text: trimmed.slice(1, -1).trim() });
        } else if (dLine.startsWith('~')) {
          let lyric = dLine.slice(1).trim();
          if (lyric.endsWith('~')) lyric = lyric.slice(0, -1).trim();
          parsed.push({ element: 'lyrics', text: lyric });
        } else if (dLine.trim().startsWith('[[') && dLine.trim().endsWith(']]')) {
          const inner = dLine.trim();
          parsed.push({ element: 'note', text: inner.slice(2, -2).trim() });
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
      const attrs = p.element === 'title_page_field'
        ? { element: p.element, key: p.key ?? 'Title' }
        : { element: p.element };
      return nodeType.create(attrs, inline.length ? inline : []);
    });

  if (nodes.length === 0) {
    const action = screenplaySchema.nodes['action'];
    nodes.push(action.create({ element: 'action' }));
  }

  return screenplaySchema.nodes['doc'].create({}, nodes);
}