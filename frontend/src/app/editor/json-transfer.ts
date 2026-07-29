import { Node as PMNode } from 'prosemirror-model';
import { screenplaySchema } from './screenplay-schema';

/** JSON is the one lossless format here — it's ProseMirror's own doc
 *  representation, so importing it back skips the Fountain-style plain
 *  text heuristic parser entirely (unlike DOC/PDF/HTML, which all funnel
 *  through parseFountain) and reconstructs the exact original document. */
export function exportScreenplayJson(doc: PMNode, filename: string): void {
  const json = JSON.stringify(doc.toJSON(), null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export function importScreenplayJson(text: string): PMNode {
  const json = JSON.parse(text);
  return PMNode.fromJSON(screenplaySchema, json);
}
