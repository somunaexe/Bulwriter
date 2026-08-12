import { parseFountain, fountainToPMDoc } from './fountain-import';
import { toFountain } from './fountain-export';

function elementsOf(parsed: ReturnType<typeof parseFountain>) {
  // title_page_field ordering/keys are covered by stripTitlePage itself —
  // here we only care about the body elements surviving the round trip.
  return parsed.filter(p => p.element !== 'title_page_field').map(p => ({ element: p.element, text: p.text }));
}

describe('Fountain import/export round trip', () => {
  const sample = `INT. COFFEE SHOP - DAY

John sits alone, staring at his coffee.

JOHN
I can't believe this is happening.

JOHN (V.O.)
Or maybe I can.

CUT TO:

EXT. STREET - NIGHT

Rain falls on empty pavement.`;

  it('preserves every element and its text through parse -> doc -> export -> re-parse', () => {
    // This is the guarantee that actually matters for a writer: a script
    // saved and reloaded (or exported and re-imported elsewhere) comes
    // back with the same scenes, cues, and dialogue it went in with.
    const firstPass = parseFountain(sample);
    const doc = fountainToPMDoc(firstPass);
    const exported = toFountain(doc);
    const secondPass = parseFountain(exported);

    expect(elementsOf(secondPass)).toEqual(elementsOf(firstPass));
  });

  it('uppercases scene headings on import, matching Fountain convention', () => {
    const parsed = parseFountain('int. house - day\n\nSomething happens.');
    expect(parsed[0]).toEqual({ element: 'scene', text: 'INT. HOUSE - DAY' });
  });

  it('recognizes a character cue only when it follows a blank line and is followed by text', () => {
    const parsed = parseFountain(
      'Some action here.\nALL CAPS ACTION LINE\n\nJOHN\nHello.'
    );

    // Not preceded by a blank line, so this stays action despite being all-caps.
    expect(parsed.find(p => p.text === 'ALL CAPS ACTION LINE')?.element).toBe('action');
    // Preceded by a blank line and followed by text, so this is a cue.
    expect(parsed.find(p => p.text === 'JOHN')?.element).toBe('character');
  });

  it('strips a character cue\'s parenthetical extension (e.g. "(V.O.)") when storing the cue', () => {
    const parsed = parseFountain('JOHN (V.O.)\nHello from off-screen.');
    expect(parsed[0]).toEqual({ element: 'character', text: 'JOHN' });
  });
});
