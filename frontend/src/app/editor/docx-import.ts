/** Extracts plain text from an uploaded .docx — paragraph breaks become
 *  newlines, which is exactly the shape parseFountain (the same parser
 *  Fountain/PDF/HTML import all funnel through) expects. Loaded on
 *  demand, same reasoning as jsPDF/docx: mammoth is real weight only an
 *  actual .docx import needs. */
export async function importDocxToText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
