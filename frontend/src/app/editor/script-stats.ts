import { Node as PMNode } from 'prosemirror-model';

export interface ScriptStats {
  wordCount: number;
  sceneList: string[];
  characterList: { name: string; lines: number }[];
}

/** Walks the top-level blocks once, tallying everything Word
 *  count / Script statistics need — scene headings in order, and
 *  character cues grouped by name (extension like "(V.O.)" stripped so
 *  "JOHN" and "JOHN (V.O.)" count as the same character). */
export function computeScriptStats(doc: PMNode): ScriptStats {
  let wordCount = 0;
  const sceneList: string[] = [];
  const characterCounts = new Map<string, number>();

  doc.forEach(node => {
    const element = node.attrs['element'];
    const text = node.textContent.trim();
    if (!text) return;

    wordCount += text.split(/\s+/).filter(Boolean).length;

    if (element === 'scene') {
      sceneList.push(text);
    }
    if (element === 'character') {
      const name = text.replace(/\(.*?\)/g, '').trim();
      if (name) characterCounts.set(name, (characterCounts.get(name) ?? 0) + 1);
    }
  });

  const characterList = Array.from(characterCounts.entries())
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines - a.lines);

  return { wordCount, sceneList, characterList };
}
