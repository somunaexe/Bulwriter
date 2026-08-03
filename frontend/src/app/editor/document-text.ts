import { importDocxToText } from './docx-import';
import { importPdfToText } from './pdf-import';

/** Extracts plain, readable text from an uploaded file — for features
 *  that want a document's prose rather than a fully parsed screenplay
 *  doc (e.g. story bible generation). Dispatches by extension, same
 *  formats the Import menu already supports for docx/pdf; everything
 *  else (.txt, .fountain, and anything unrecognized) is just read as
 *  plain text, since Fountain's own markup is already human-readable
 *  prose and doesn't need parsing for this purpose. */
export async function extractDocumentText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return importDocxToText(file);
  if (name.endsWith('.pdf')) return importPdfToText(file);
  return file.text();
}
