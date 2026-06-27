import { screenplaySchema, ScreenplayElement } from './screenplay-schema';
import { Node as PMNode } from 'prosemirror-model';

interface ParsedLine {
  element: ScreenplayElement;
  text: string;
}

export function parseFountain(fountain: string): ParsedLine[] {
  const rawLines = fountain.split('\n');
  const lines = rawLines.map(l => l.trimEnd());
  const parsed: ParsedLine[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : null;
    const next = i < lines.length - 1 ? lines[i + 1] : null;

    if (line.trim() === '') { i++; continue; }

    if (line.startsWith('.') && !line.startsWith('..')) {
      parsed.push({ element: 'scene_heading', text: line.slice(1).trim() });
      i++; continue;
    }

    if (/^(INT|EXT|INT\.\/EXT|I\/E|EST)[\.\s]/i.test(line)) {
      parsed.push({ element: 'scene_heading', text: line.toUpperCase() });
      i++; continue;
    }

    if (line.startsWith('>') && !line.endsWith('<')) {
      parsed.push({ element: 'transition', text: line.slice(1).trim() });
      i++; continue;
    }

    if (/\sTO:$/.test(line) && line === line.toUpperCase()) {
      parsed.push({ element: 'transition', text: line });
      i++; continue;
    }

    if (line.trim().startsWith('(') && line.trim().endsWith(')')) {
      parsed.push({ element: 'parenthetical', text: line.trim() });
      i++; continue;
    }

    const isAllCaps = line.trim() === line.trim().toUpperCase() && /[A-Z]/.test(line);
    const prevIsBlank = prev === null || prev.trim() === '';
    const nextIsText = next !== null && next.trim() !== '';

    if (isAllCaps && prevIsBlank && nextIsText) {
      const charName = line.replace(/\s*\(.*?\)\s*$/, '').trim();
      parsed.push({ element: 'character', text: charName });
      i++;

      while (i < lines.length && lines[i].trim() !== '') {
        const dLine = lines[i];
        if (dLine.trim().startsWith('(') && dLine.trim().endsWith(')')) {
          parsed.push({ element: 'parenthetical', text: dLine.trim() });
        } else {
          parsed.push({ element: 'dialogue', text: dLine.trim() });
        }
        i++;
      }
      continue;
    }

    parsed.push({ element: 'action', text: line });
    i++;
  }

  return parsed;
}

export function fountainToPMDoc(parsed: ParsedLine[]): PMNode {
  const nodes = parsed
    .filter(p => p.text.trim() !== '')
    .map(p => {
      const nodeType = (screenplaySchema.nodes as any)[p.element];
      const textNode = p.text ? screenplaySchema.text(p.text) : undefined;
      return nodeType.create({ element: p.element }, textNode ? [textNode] : []);
    });

  if (nodes.length === 0) {
    const action = screenplaySchema.nodes['action'];
    nodes.push(action.create({ element: 'action' }));
  }

  return screenplaySchema.nodes['doc'].create({}, nodes);
}