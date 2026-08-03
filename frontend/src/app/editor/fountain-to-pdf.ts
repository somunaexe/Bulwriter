import { Node as PMNode } from 'prosemirror-model';
import { ScreenplayElement } from './screenplay-schema';

export interface PdfExportOptions {
  filename: string;
  /** Encrypts the PDF with this as both user and owner password when set.
   *  Left undefined/empty to export unprotected. */
  password?: string;
}

// Traditional screenplay typesetting: 12pt Courier at 10 characters per
// inch / 6 lines per inch — the same convention --script-width and the
// on-screen ch-based indents (styles.scss) are already built around, just
// at true print spacing instead of the app's looser on-screen line-height.
const PAGE_W = 8.5;
const PAGE_H = 11;
const MARGIN_TOP = 1;
const MARGIN_BOTTOM = 1;
const MARGIN_RIGHT = 1;
const MARGIN_LEFT = 1.5;
const CHAR_W = 1 / 10;
const LINE_H = 1 / 6;
const FONT_SIZE = 12;

const CONTENT_LEFT = MARGIN_LEFT;
const CONTENT_RIGHT = PAGE_W - MARGIN_RIGHT;

/** Courier is monospace, so wrapping by character count matches the
 *  on-screen ch-based max-widths exactly — no need for jsPDF's slower,
 *  pixel-measuring splitTextToSize. */
function wrapByChars(text: string, maxChars: number): string[] {
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

/** Renders a ProseMirror screenplay document as an industry-formatted
 *  PDF and triggers a browser download. Title page fields (if any) get
 *  their own unnumbered page; body pages are numbered from the second
 *  one on — this is the one place real, accurate page breaks actually
 *  get computed; the in-editor view is a single continuous sheet with
 *  no attempt to mirror them (see .pm-mount .ProseMirror in styles.scss).
 *
 *  jsPDF pulls in html2canvas/canvg (needed for its .html() renderer,
 *  which nothing here uses, but the package doesn't tree-shake them
 *  out) — that's enough extra weight to blow the initial bundle budget
 *  if imported statically. Loaded on demand instead, same pattern as
 *  prosemirror-history in EditorComponent.undo()/redo(). */
export async function exportScreenplayPdf(doc: PMNode, opts: PdfExportOptions): Promise<void> {
  const { default: jsPDF } = await import('jspdf');

  const children: PMNode[] = [];
  doc.forEach(n => children.push(n));

  let bodyStart = 0;
  while (bodyStart < children.length && children[bodyStart].attrs['element'] === 'title_page_field') {
    bodyStart++;
  }
  const titleNodes = children.slice(0, bodyStart);
  const bodyNodes = children.slice(bodyStart);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter',
    ...(opts.password
      ? {
          encryption: {
            userPassword: opts.password,
            ownerPassword: opts.password,
            userPermissions: ['print'],
          },
        }
      : {}),
  });

  pdf.setFont('courier', 'normal');
  pdf.setFontSize(FONT_SIZE);

  // ── Title page ──
  const titleFields = titleNodes
    .map(n => ({ key: String(n.attrs['key'] || 'Title').toLowerCase(), text: n.textContent.trim() }))
    .filter(f => f.text !== '');

  if (titleFields.length) {
    let y = PAGE_H / 2.6;
    const title  = titleFields.find(f => f.key === 'title');
    const credit = titleFields.find(f => f.key === 'credit');
    const author = titleFields.find(f => f.key === 'author');
    const rest   = titleFields.filter(f => !['title', 'credit', 'author', 'contact'].includes(f.key));

    if (title) {
      pdf.setFont('courier', 'bold');
      pdf.text(title.text.toUpperCase(), PAGE_W / 2, y, { align: 'center' });
      y += LINE_H * 3;
      pdf.setFont('courier', 'normal');
    }
    for (const f of [credit, author, ...rest].filter((f): f is { key: string; text: string } => !!f)) {
      pdf.text(f.text, PAGE_W / 2, y, { align: 'center' });
      y += LINE_H * 2;
    }

    // Contact info conventionally sits at the bottom-left of the title page.
    const contact = titleFields.find(f => f.key === 'contact');
    if (contact) {
      const lines = contact.text.split('\n');
      let cy = PAGE_H - MARGIN_BOTTOM - LINE_H * (lines.length - 1);
      for (const line of lines) {
        pdf.text(line, CONTENT_LEFT, cy);
        cy += LINE_H;
      }
    }

    pdf.addPage();
  }

  // ── Body ──
  let y = MARGIN_TOP;
  let pageNum = 1; // body pages only — the title page (if any) doesn't count

  const ensureSpace = (lines: number): void => {
    if (y + lines * LINE_H <= PAGE_H - MARGIN_BOTTOM) return;
    pdf.addPage();
    pageNum++;
    y = MARGIN_TOP;
    if (pageNum > 1) {
      pdf.setFont('courier', 'normal');
      pdf.text(`${pageNum}.`, CONTENT_RIGHT, MARGIN_TOP - LINE_H, { align: 'right' });
    }
  };

  const writeLines = (
    lines: string[],
    x: number,
    align: 'left' | 'right' | 'center',
    bold: boolean,
    uppercase: boolean
  ): void => {
    pdf.setFont('courier', bold ? 'bold' : 'normal');
    for (const line of lines) {
      ensureSpace(1);
      pdf.text(uppercase ? line.toUpperCase() : line, x, y, { align });
      y += LINE_H;
    }
  };

  for (const node of bodyNodes) {
    const element = node.attrs['element'] as ScreenplayElement | undefined;
    const text = node.textContent.trim();

    if (element === 'note') continue; // internal notes don't print
    if (!element || !text) {
      y += LINE_H * .5;
      continue;
    }

    switch (element) {
      case 'scene':
      case 'shot':
      case 'sequence':
        y += LINE_H;
        writeLines(wrapByChars(text, 60), CONTENT_LEFT, 'left', false, true);
        break;

      case 'action':
        writeLines(wrapByChars(text, 60), CONTENT_LEFT, 'left', false, false);
        break;

      case 'character':
      case 'dual_dialogue':
        y += LINE_H;
        // A character cue alone at the bottom of a page, with its
        // dialogue pushed to the next one, is a classic formatting
        // mistake — check for at least 2 lines of room so it isn't
        // orphaned. Not a full lookahead at how long the dialogue
        // actually is, just a reasonable floor.
        ensureSpace(2);
        writeLines(wrapByChars(text, 38), CONTENT_LEFT + 22 * CHAR_W, 'left', false, true);
        break;

      case 'parenthetical': {
        const bare = text.replace(/^\(/, '').replace(/\)$/, '');
        writeLines(wrapByChars(`(${bare})`, 26), CONTENT_LEFT + 16 * CHAR_W, 'left', false, false);
        break;
      }

      case 'dialogue':
        writeLines(wrapByChars(text, 35), CONTENT_LEFT + 10 * CHAR_W, 'left', false, false);
        break;

      case 'transition':
        y += LINE_H;
        writeLines(wrapByChars(text, 30), CONTENT_RIGHT, 'right', false, true);
        break;

      case 'lyrics':
        writeLines(wrapByChars(text, 45), PAGE_W / 2, 'center', false, false);
        break;
    }
  }

  pdf.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`);
}
