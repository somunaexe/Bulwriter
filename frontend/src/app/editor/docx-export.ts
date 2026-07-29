import { Node as PMNode } from 'prosemirror-model';
import type { AlignmentType as AlignmentTypeT } from 'docx';
import { ScreenplayElement } from './screenplay-schema';

// Same industry margins/indents as fountain-to-pdf.ts, in inches.
function inchesToTwip(inches: number): number {
  return Math.round(inches * 1440);
}

/** Renders a ProseMirror screenplay document as a real .docx and triggers
 *  a browser download — same per-element formatting as
 *  exportScreenplayPdf, just built from docx's Paragraph/TextRun API
 *  instead of jsPDF's text-positioning calls.
 *
 *  Loaded on demand — same reasoning as jsPDF in fountain-to-pdf.ts: a
 *  document-building library is real weight that only the rare export
 *  actually needs. */
export async function exportScreenplayDocx(doc: PMNode, filename: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import('docx');

  const children: PMNode[] = [];
  doc.forEach(n => children.push(n));

  const makeParagraph = (
    text: string,
    opts: { indentIn?: number; align?: (typeof AlignmentTypeT)[keyof typeof AlignmentTypeT]; bold?: boolean; uppercase?: boolean; italic?: boolean } = {},
  ) => new Paragraph({
    alignment: opts.align,
    indent: opts.indentIn ? { left: inchesToTwip(opts.indentIn) } : undefined,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: opts.uppercase ? text.toUpperCase() : text,
        bold: opts.bold,
        italics: opts.italic,
        font: 'Courier New',
        size: 24, // half-points — 12pt
      }),
    ],
  });

  const paragraphs: InstanceType<typeof Paragraph>[] = [];

  for (const node of children) {
    const element = node.attrs['element'] as ScreenplayElement | undefined;
    const text = node.textContent.trim();
    if (element === 'note' || !element || !text) continue;

    switch (element) {
      case 'scene':
      case 'shot':
      case 'sequence':
        paragraphs.push(makeParagraph(text, { bold: true, uppercase: true }));
        break;

      case 'action':
        paragraphs.push(makeParagraph(text));
        break;

      case 'character':
      case 'dual_dialogue':
        paragraphs.push(makeParagraph(text, { indentIn: 2.2, uppercase: true }));
        break;

      case 'parenthetical': {
        const bare = text.replace(/^\(/, '').replace(/\)$/, '');
        paragraphs.push(makeParagraph(`(${bare})`, { indentIn: 1.6 }));
        break;
      }

      case 'dialogue':
        paragraphs.push(makeParagraph(text, { indentIn: 1 }));
        break;

      case 'transition':
        paragraphs.push(makeParagraph(text, { align: AlignmentType.RIGHT, uppercase: true }));
        break;

      case 'lyrics':
        paragraphs.push(makeParagraph(text, { align: AlignmentType.CENTER, italic: true }));
        break;

      case 'title_page_field': {
        const key = String(node.attrs['key'] || 'Title').toLowerCase();
        paragraphs.push(makeParagraph(text, {
          align: AlignmentType.CENTER,
          bold: key === 'title',
          uppercase: key === 'title',
        }));
        break;
      }
    }
  }

  if (!paragraphs.length) paragraphs.push(makeParagraph(''));

  // Named docxDoc, not `document` — that would shadow the global DOM
  // `document` used below to trigger the actual file download.
  const docxDoc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: inchesToTwip(1),
            bottom: inchesToTwip(1),
            right: inchesToTwip(1),
            left: inchesToTwip(1.5),
          },
        },
      },
      children: paragraphs,
    }],
  });

  const blob = await Packer.toBlob(docxDoc);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
