import { ScreenplayElement } from './screenplay-schema';

// Traditional screenplay typesetting: 12pt Courier at 10 characters per
// inch / 6 lines per inch — the same convention --script-width and the
// on-screen ch-based indents (styles.scss) are already built around, just
// at true print spacing instead of the app's looser on-screen line-height.
// Shared by fountain-to-pdf.ts (the real PDF export) and pagination.ts
// (the live editor's page-break decorations), so both agree on where a
// page actually breaks instead of maintaining two separate
// implementations that could drift apart.
export const PAGE_W = 8.5;
export const PAGE_H = 11;
export const MARGIN_TOP = 1;
export const MARGIN_BOTTOM = 1;
export const MARGIN_RIGHT = 1;
export const MARGIN_LEFT = 1.5;
export const CHAR_W = 1 / 10;
export const LINE_H = 1 / 6;
export const FONT_SIZE = 12;

export const CONTENT_LEFT = MARGIN_LEFT;
export const CONTENT_RIGHT = PAGE_W - MARGIN_RIGHT;

// Usable line count per page — content height divided by line height —
// what pagination.ts budgets each page's content against.
export const PAGE_LINES = Math.round((PAGE_H - MARGIN_TOP - MARGIN_BOTTOM) / LINE_H);

/** Courier is monospace, so wrapping by character count matches the
 *  on-screen ch-based max-widths exactly — no need for jsPDF's slower,
 *  pixel-measuring splitTextToSize, and no DOM measurement needed at all
 *  for the live editor's page breaks either. */
export function wrapByChars(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines;
}

// Wrap width per element — the same values fountain-to-pdf.ts's
// writeLines calls already use.
export const MAX_CHARS: Partial<Record<ScreenplayElement, number>> = {
  scene: 60, shot: 60, sequence: 60, action: 60,
  character: 38, dual_dialogue: 38,
  parenthetical: 26,
  dialogue: 35,
  transition: 30,
  lyrics: 45,
};

// A blank line printed before these elements — matches the `y += LINE_H`
// calls scattered through fountain-to-pdf.ts's export loop.
export const LEADING_BLANK_LINES: Partial<Record<ScreenplayElement, number>> = {
  scene: 1, shot: 1, sequence: 1,
  character: 1, dual_dialogue: 1,
  transition: 1,
};
