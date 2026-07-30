import { Node as PMNode } from 'prosemirror-model';

// A scene as it exists in the live document right now — heading and cast
// are always derived fresh from the text (never stored), so they can
// never go stale the way a manually-copied list would.
export interface SceneEntry {
  // Keys a scene's persisted tags (props/notes — see SceneBreakdownService)
  // to its heading text, since the schema has no durable per-scene ID.
  // Two scenes sharing an identical heading (e.g. two different
  // "INT. CAR - DAY" scenes) will therefore share the same tags — an
  // accepted v1 limitation rather than a stable-but-fragile index key
  // that breaks the moment scenes are reordered.
  sceneKey: string;
  number: number;
  heading: string;
  cast: string[];
}

/** Walks the top-level blocks once, grouping everything between scene
 *  headings into a SceneEntry, collecting the unique characters (cue
 *  text, extension like "(V.O.)" stripped) that speak within each. */
export function computeSceneList(doc: PMNode): SceneEntry[] {
  const scenes: SceneEntry[] = [];
  let current: SceneEntry | null = null;

  doc.forEach(node => {
    const element = node.attrs['element'];
    const text = node.textContent.trim();

    if (element === 'scene') {
      current = {
        sceneKey: text || `Untitled scene ${scenes.length + 1}`,
        number: scenes.length + 1,
        heading: text || `Untitled scene ${scenes.length + 1}`,
        cast: [],
      };
      scenes.push(current);
      return;
    }

    // Action/dialogue/etc. before the first scene heading (e.g. a title
    // page) has no scene to attach to yet.
    if (!current) return;

    if (element === 'character' && text) {
      const name = text.replace(/\(.*?\)/g, '').trim();
      if (name && !current.cast.includes(name)) current.cast.push(name);
    }
  });

  return scenes;
}

export interface BreakdownRow extends SceneEntry {
  props: string[];
  costumes: string[];
  setDressing: string[];
  notes: string;
}

export function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function breakdownToCsv(rows: BreakdownRow[]): string {
  const header = ['#', 'Scene', 'Cast', 'Props', 'Costumes', 'Set dressing', 'Notes'];
  const lines = [header.map(csvCell).join(',')];

  for (const row of rows) {
    lines.push([
      String(row.number),
      row.heading,
      row.cast.join('; '),
      row.props.join('; '),
      row.costumes.join('; '),
      row.setDressing.join('; '),
      row.notes,
    ].map(csvCell).join(','));
  }

  return lines.join('\r\n');
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
