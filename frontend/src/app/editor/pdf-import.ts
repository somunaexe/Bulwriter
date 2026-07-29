/** Extracts text from an uploaded PDF, reconstructing line breaks from
 *  each text run's position — pdf.js's own getTextContent() returns a
 *  flat list of positioned runs, not lines, so runs are grouped by
 *  their y-coordinate (within a small tolerance) into one line each.
 *  Without that, everything on a page would come back as one giant run
 *  of text with no structure for parseFountain's blank-line/ALL-CAPS
 *  heuristics to work from. Loaded on demand — same reasoning as
 *  jsPDF/docx/mammoth. */
export async function importPdfToText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const lines: { y: number; text: string }[] = [];
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue; // skip marked-content markers
      const y = Math.round(item.transform[5]);
      const existing = lines.find(l => Math.abs(l.y - y) < 2);
      if (existing) existing.text += item.str;
      else lines.push({ y, text: item.str });
    }
    lines.sort((a, b) => b.y - a.y); // pdf.js's y-axis is bottom-up

    pageTexts.push(lines.map(l => l.text).join('\n'));
  }

  return pageTexts.join('\n\n');
}
