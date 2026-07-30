import { Still, PressKitCastRow, PressKitCrewRow } from '../services/press-kit.service';

export interface PressKitPdfOptions {
  scriptTitle: string;
  logline: string;
  synopsis: string;
  directorStatement: string;
  poster: string;
  stills: Still[];
  cast: PressKitCastRow[];
  crew: PressKitCrewRow[];
  filename: string;
}

const PAGE_W = 8.5;
const PAGE_H = 11;
const MARGIN = .75;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = .22;
const BOTTOM = PAGE_H - MARGIN;

/** Renders the press kit as a PDF and triggers a browser download —
 *  plain business formatting (Helvetica), same reasoning as
 *  call-sheet-pdf.ts: this is a production/marketing document, not the
 *  manuscript, so it doesn't use fountain-to-pdf.ts's screenplay
 *  typesetting. Loaded on demand, same as jsPDF everywhere else in this
 *  app — real weight only an actual export needs. Images (poster,
 *  stills) are always JPEG data URIs, since they're all produced by
 *  background-image.ts's fileToBackgroundDataUri. */
export async function exportPressKitPdf(opts: PressKitPdfOptions): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });

  let y = MARGIN;

  const ensureRoom = (needed: number): void => {
    if (y + needed > BOTTOM) {
      pdf.addPage();
      y = MARGIN;
    }
  };

  const heading = (text: string, size: number, bold = true): void => {
    ensureRoom(LINE_H * (size / 11));
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.text(text, MARGIN, y);
    y += LINE_H * (size / 11);
  };

  const paragraph = (text: string, size = 10.5): void => {
    if (!text.trim()) return;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, CONTENT_W) as string[];
    for (const line of lines) {
      ensureRoom(LINE_H);
      pdf.text(line, MARGIN, y);
      y += LINE_H;
    }
  };

  const section = (title: string, body: string): void => {
    if (!body.trim()) return;
    y += LINE_H * .5;
    heading(title, 12);
    y += LINE_H * .3;
    paragraph(body);
  };

  // ── Title page ───────────────────────────────────────────────────
  heading(opts.scriptTitle, 20);
  if (opts.logline.trim()) {
    y += LINE_H * .2;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(11.5);
    const lines = pdf.splitTextToSize(opts.logline, CONTENT_W) as string[];
    for (const line of lines) {
      pdf.text(line, MARGIN, y);
      y += LINE_H;
    }
  }
  y += LINE_H * .5;

  if (opts.poster) {
    try {
      const props = pdf.getImageProperties(opts.poster);
      const maxH = 5;
      const maxW = CONTENT_W;
      const scale = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      ensureRoom(h);
      pdf.addImage(opts.poster, 'JPEG', MARGIN, y, w, h);
      y += h + LINE_H * .5;
    } catch (err) {
      console.error('Could not embed poster image:', err);
    }
  }

  section('Synopsis', opts.synopsis);
  section("Director's Statement", opts.directorStatement);

  // ── Cast ─────────────────────────────────────────────────────────
  if (opts.cast.length) {
    y += LINE_H * .5;
    heading(`Cast (${opts.cast.length})`, 12);
    y += LINE_H * .3;
    for (const row of opts.cast) {
      ensureRoom(LINE_H);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.text(`${row.actorName || 'Unnamed actor'} as ${row.characterName}`, MARGIN, y);
      y += LINE_H;
      if (row.bio.trim()) {
        y += LINE_H * .1;
        paragraph(row.bio, 9.5);
      }
      y += LINE_H * .3;
    }
  }

  // ── Crew ─────────────────────────────────────────────────────────
  if (opts.crew.length) {
    y += LINE_H * .5;
    heading(`Crew (${opts.crew.length})`, 12);
    y += LINE_H * .3;
    for (const row of opts.crew) {
      ensureRoom(LINE_H);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.text(`${row.name}${row.role ? ' — ' + row.role : ''}`, MARGIN, y);
      y += LINE_H;
      if (row.bio.trim()) {
        y += LINE_H * .1;
        paragraph(row.bio, 9.5);
      }
      y += LINE_H * .3;
    }
  }

  // ── Stills ───────────────────────────────────────────────────────
  if (opts.stills.length) {
    pdf.addPage();
    y = MARGIN;
    heading(`Stills (${opts.stills.length})`, 12);
    y += LINE_H * .3;

    for (const still of opts.stills) {
      if (!still.image) continue;
      try {
        const props = pdf.getImageProperties(still.image);
        const maxW = CONTENT_W;
        const maxH = 4;
        const scale = Math.min(maxW / props.width, maxH / props.height);
        const w = props.width * scale;
        const h = props.height * scale;
        ensureRoom(h + LINE_H);
        pdf.addImage(still.image, 'JPEG', MARGIN, y, w, h);
        y += h + LINE_H * .2;
        if (still.caption.trim()) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(9.5);
          pdf.text(still.caption, MARGIN, y);
          y += LINE_H;
        }
        y += LINE_H * .3;
      } catch (err) {
        console.error('Could not embed still image:', err);
      }
    }
  }

  pdf.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`);
}
