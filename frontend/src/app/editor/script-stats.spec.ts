import { screenplaySchema } from './screenplay-schema';
import { computeScriptStats } from './script-stats';

function buildDoc(blocks: { element: string; text: string }[]) {
  return screenplaySchema.node(
    'doc',
    null,
    blocks.map(b => screenplaySchema.node(b.element, null, b.text ? screenplaySchema.text(b.text) : undefined))
  );
}

describe('computeScriptStats', () => {
  it('counts words across every block with visible text', () => {
    const doc = buildDoc([
      { element: 'scene', text: 'INT. HOUSE - DAY' },
      { element: 'action', text: 'John walks in slowly.' },
    ]);

    // "INT. HOUSE - DAY" (4 words when whitespace-split) + "John walks in slowly." (4 words)
    expect(computeScriptStats(doc).wordCount).toBe(8);
  });

  it('skips blocks with no text at all', () => {
    const doc = buildDoc([{ element: 'action', text: '' }]);
    expect(computeScriptStats(doc).wordCount).toBe(0);
  });

  it('collects scene headings in document order', () => {
    const doc = buildDoc([
      { element: 'scene', text: 'INT. HOUSE - DAY' },
      { element: 'action', text: 'Something happens.' },
      { element: 'scene', text: 'EXT. STREET - NIGHT' },
    ]);

    expect(computeScriptStats(doc).sceneList).toEqual(['INT. HOUSE - DAY', 'EXT. STREET - NIGHT']);
  });

  it('merges a character\'s plain cue with its extension variants (e.g. "(V.O.)") into one count', () => {
    const doc = buildDoc([
      { element: 'character', text: 'JOHN' },
      { element: 'dialogue', text: 'Hello.' },
      { element: 'character', text: 'JOHN (V.O.)' },
      { element: 'dialogue', text: 'Or am I.' },
      { element: 'character', text: 'JOHN (CONT\'D)' },
      { element: 'dialogue', text: 'Still me.' },
    ]);

    const { characterList } = computeScriptStats(doc);
    expect(characterList).toEqual([{ name: 'JOHN', lines: 3 }]);
  });

  it('sorts characters by line count, most-lines first', () => {
    const doc = buildDoc([
      { element: 'character', text: 'JOHN' },
      { element: 'dialogue', text: 'One.' },
      { element: 'character', text: 'MARY' },
      { element: 'dialogue', text: 'One.' },
      { element: 'character', text: 'MARY' },
      { element: 'dialogue', text: 'Two.' },
    ]);

    expect(computeScriptStats(doc).characterList).toEqual([
      { name: 'MARY', lines: 2 },
      { name: 'JOHN', lines: 1 },
    ]);
  });
});
