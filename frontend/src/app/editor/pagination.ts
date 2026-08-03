import { Node as PMNode } from 'prosemirror-model';
import { ScreenplayElement } from './screenplay-schema';
import { wrapByChars, MAX_CHARS, LEADING_BLANK_LINES, PAGE_LINES } from './page-layout';

export interface PageBreak {
  /** The doc position right before the block a new page starts at —
   *  where a page-break decoration should be inserted. */
  pos: number;
  /** 1-indexed body page number, or null for the title-page → body
   *  separator, which (like the title page and body page 1) isn't
   *  numbered — matches fountain-to-pdf.ts's own convention. */
  pageNumber: number | null;
}

/** Computes where the script would break across printed pages, using the
 *  exact same character-wrapping/line-counting math as the real PDF
 *  export (fountain-to-pdf.ts, via the shared page-layout.ts). Courier is
 *  monospace, so this is fully deterministic from the text alone — no DOM
 *  measurement required, which is what makes it cheap enough to recompute
 *  live while typing (see pagination-plugin.ts).
 *
 *  Breaks land BETWEEN blocks, never mid-paragraph — unlike PDF export,
 *  which can split a long action paragraph or monologue mid-block onto
 *  two pages. In practice screenplay blocks are short enough that this
 *  rarely differs; an unusually long unbroken block is instead moved to
 *  the next page in full, which can make the live view's page count for
 *  that block-run drift slightly from the exported PDF's. */
export function computePageBreaks(doc: PMNode): PageBreak[] {
  const breaks: PageBreak[] = [];
  let linesUsed = 0;
  let pageNumber = 1;
  let sawTitleField = false;
  let sawBodyBlock = false;

  doc.forEach((node, offset) => {
    const element = node.attrs['element'] as ScreenplayElement | undefined;

    if (element === 'title_page_field') {
      sawTitleField = true;
      return;
    }
    if (!element || element === 'note') return;

    // The title page always gets its own page, separate from the body —
    // same convention fountain-to-pdf.ts follows (an unconditional new
    // page after the title fields). Neither it nor body page 1 is
    // numbered, so this separator carries no page number.
    if (sawTitleField && !sawBodyBlock) {
      breaks.push({ pos: offset, pageNumber: null });
      linesUsed = 0;
    }
    sawBodyBlock = true;

    const text = node.textContent.trim();
    if (!text) {
      linesUsed += 0.5;
      return;
    }

    const maxChars = MAX_CHARS[element] ?? 60;
    const bodyText = element === 'parenthetical'
      ? `(${text.replace(/^\(/, '').replace(/\)$/, '')})`
      : text;
    const lineCount = wrapByChars(bodyText, maxChars).length;
    const leadingBlank = LEADING_BLANK_LINES[element] ?? 0;
    const totalLines = leadingBlank + lineCount;

    // A character cue stranded alone at the bottom of a page, with its
    // dialogue pushed to the next one, is a classic formatting mistake —
    // same guard fountain-to-pdf.ts uses: check for room for the cue plus
    // at least one more line before committing it to the current page,
    // rather than requiring the whole (possibly much longer) block to fit.
    const isCue = element === 'character' || element === 'dual_dialogue';
    const required = isCue ? leadingBlank + Math.min(lineCount, 2) : totalLines;

    if (linesUsed > 0 && linesUsed + required > PAGE_LINES) {
      pageNumber++;
      breaks.push({ pos: offset, pageNumber });
      linesUsed = 0;
    }

    linesUsed += totalLines;
  });

  return breaks;
}
