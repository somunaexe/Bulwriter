import { ScheduleDay } from './stripboard';

export interface CallSheetOptions {
  projectTitle: string;
  totalDays: number;
}

const PAGE_W = 8.5;
const MARGIN = .75;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = .22;

/** Renders one shoot day's call sheet as a PDF and triggers a browser
 *  download — plain business formatting (Helvetica), not the screenplay
 *  typesetting fountain-to-pdf.ts uses, since this is a production
 *  document, not the manuscript. Loaded on demand, same reasoning as
 *  jsPDF everywhere else in this app: it's real weight only an actual
 *  export needs. */
export async function exportCallSheetPdf(day: ScheduleDay, opts: CallSheetOptions): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });

  let y = MARGIN;

  const heading = (text: string, size: number, bold = true): void => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.text(text, MARGIN, y);
    y += LINE_H * (size / 11);
  };

  const wrapWidth = (text: string, size: number): string[] => {
    pdf.setFontSize(size);
    return pdf.splitTextToSize(text, CONTENT_W) as string[];
  };

  heading(opts.projectTitle, 16);
  heading(`Call Sheet — Day ${day.dayNumber} of ${opts.totalDays}`, 12, false);
  y += LINE_H;

  pdf.setDrawColor(180);
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += LINE_H;

  const field = (label: string, value: string): void => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(label, MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value || '—', MARGIN + 1.3, y);
    y += LINE_H;
  };

  field('Shoot date:', day.shootDate);
  field('General call:', day.callTime);
  field('Location:', day.location);
  y += LINE_H * .5;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(`Scenes (${day.strips.length})`, MARGIN, y);
  y += LINE_H * 1.3;

  pdf.setFontSize(10);
  for (const strip of day.strips) {
    if (y > 10.3) {
      pdf.addPage();
      y = MARGIN;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${strip.number}.`, MARGIN, y);
    pdf.text(strip.heading, MARGIN + .4, y);
    y += LINE_H;

    if (strip.cast.length) {
      pdf.setFont('helvetica', 'normal');
      const castLines = wrapWidth(`Cast: ${strip.cast.join(', ')}`, 9.5);
      for (const line of castLines) {
        pdf.text(line, MARGIN + .4, y);
        y += LINE_H * .85;
      }
    }
    y += LINE_H * .4;
  }

  if (day.notes.trim()) {
    y += LINE_H * .5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Notes', MARGIN, y);
    y += LINE_H * 1.3;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    for (const line of wrapWidth(day.notes, 10)) {
      if (y > 10.5) {
        pdf.addPage();
        y = MARGIN;
      }
      pdf.text(line, MARGIN, y);
      y += LINE_H;
    }
  }

  pdf.save(`call-sheet-day-${day.dayNumber}.pdf`);
}
