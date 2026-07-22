import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model';

// --------------------------- SCREENPLAY SCHEMA ----------------------------- //

// ---------------------------------------------------------------------------
// Node specs
// Each node maps to one screenplay element type.
// The `element` attribute is stored on the node so we can style + identify it.
// ---------------------------------------------------------------------------

const screenplayNodes: Record<string, NodeSpec> = {
  doc: {
    content: 'block+',
  },

  // Scene heading — INT. CAFÉ - DAY
  scene_heading: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'scene_heading' } },
    parseDOM: [{ tag: 'p[data-element="scene_heading"]' }],
    toDOM: () => ['p', { 'data-element': 'scene_heading', class: 'pm-scene-heading' }, 0],
  },

  // Action — description of what we see
  action: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'action' } },
    parseDOM: [{ tag: 'p[data-element="action"]' }],
    toDOM: () => ['p', { 'data-element': 'action', class: 'pm-action' }, 0],
  },

  // Character name — centred, above dialogue
  character: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'character' } },
    parseDOM: [{ tag: 'p[data-element="character"]' }],
    toDOM: () => ['p', { 'data-element': 'character', class: 'pm-character' }, 0],
  },

  // Dialogue — what the character says
  dialogue: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'dialogue' } },
    parseDOM: [{ tag: 'p[data-element="dialogue"]' }],
    toDOM: () => ['p', { 'data-element': 'dialogue', class: 'pm-dialogue' }, 0],
  },

  // Parenthetical — (quietly) or (beat)
  parenthetical: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'parenthetical' } },
    parseDOM: [{ tag: 'p[data-element="parenthetical"]' }],
    toDOM: () => ['p', { 'data-element': 'parenthetical', class: 'pm-parenthetical' }, 0],
  },

  // Transition — CUT TO: FADE OUT.
  transition: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'transition' } },
    parseDOM: [{ tag: 'p[data-element="transition"]' }],
    toDOM: () => ['p', { 'data-element': 'transition', class: 'pm-transition' }, 0],
  },
  
  // Shot — CLOSE ON JOHN
  shot: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'shot' } },
    parseDOM: [{ tag: 'p[data-element="shot"]' }],
    toDOM: () => ['p', { 'data-element': 'shot', class: 'pm-shot' }, 0],
  },

  // Lyrics — ♪ Somewhere over the rainbow ♪
  lyrics: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'lyrics' } },
    parseDOM: [{ tag: 'p[data-element="lyrics"]' }],
    toDOM: () => ['p', { 'data-element': 'lyrics', class: 'pm-lyrics' }, 0],
  },

  // Dual Dialogue — simultaneous speech
  dual_dialogue: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'dual_dialogue' } },
    parseDOM: [{ tag: 'p[data-element="dual_dialogue"]' }],
    toDOM: () => ['p', { 'data-element': 'dual_dialogue', class: 'pm-dual-dialogue' }, 0],
  },

  // Sequence Heading — TRAINING MONTAGE
  sequence_heading: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'sequence_heading' } },
    parseDOM: [{ tag: 'p[data-element="sequence_heading"]' }],
    toDOM: () => ['p', { 'data-element': 'sequence_heading', class: 'pm-sequence-heading' }, 0],
  },

  // Note — internal writer note
  note: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'note' } },
    parseDOM: [{ tag: 'p[data-element="note"]' }],
    toDOM: () => ['p', { 'data-element': 'note', class: 'pm-note' }, 0],
  },

  // Title page field — Title, Credit, Author, Contact, etc. Lives at the
  // very start of the doc, outside the flowing screenplay body. `key`
  // holds the field name (what Fountain writes as "Key: value").
  title_page_field: {
    group: 'block',
    content: 'inline*',
    attrs: { element: { default: 'title_page_field' }, key: { default: 'Title' } },
    parseDOM: [{
      tag: 'p[data-element="title_page_field"]',
      getAttrs: (dom) => ({ key: (dom as HTMLElement).getAttribute('data-key') || 'Title' }),
    }],
    toDOM: (node) => [
      'p',
      {
        'data-element': 'title_page_field',
        'data-key': String(node.attrs['key'] || 'Title').toLowerCase(),
        class: 'pm-title-page-field',
      },
      0,
    ],
  },

  // Inline nodes
  text: { group: 'inline' },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },
};

const screenplayMarks: Record<string, MarkSpec> = {
  // Bold for character extensions like (V.O.) (O.S.)
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
    toDOM: () => ['strong', 0],
  },
  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }],
    toDOM: () => ['em', 0],
  },
  underline: {
    parseDOM: [{ tag: 'u' }],
    toDOM: () => ['u', 0],
  },
};

export const screenplaySchema = new Schema({
  nodes: screenplayNodes,
  marks: screenplayMarks,
});

// ---------------------------  ----------------------------- //
// Element type helpers
export type ScreenplayElement =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'shot'
  | 'lyrics'
  | 'dual_dialogue'
  | 'sequence_heading'
  | 'note'
  | 'title_page_field';

export const ELEMENT_LABELS: Record<ScreenplayElement, string> = {
  scene_heading:    'Scene heading',
  action:           'Action',
  character:        'Character',
  dialogue:         'Dialogue',
  parenthetical:    'Parenthetical',
  transition:       'Transition',
  shot:             'Shot',
  lyrics:           'Lyrics',
  dual_dialogue:    'Dual Dialogue',
  sequence_heading: 'Sequence Heading',
  note:             'Note',
  title_page_field: 'Title Page Field',
};

// Common title page field names, in the order a real title page presents
// them. Used by "Insert title page" and to label the field CSS.
export const TITLE_PAGE_KEYS = ['Title', 'Credit', 'Author', 'Draft date', 'Contact'] as const;

// Tab cycles through this sequence. title_page_field is intentionally left
// out of the toolbar/Tab cycle — it's structural (Title/Author/etc.), not
// something you freely retype a line as.
export const TAB_CYCLE: Record<ScreenplayElement, ScreenplayElement> = {
  scene_heading:    'action',
  action:           'character',
  character:        'parenthetical',
  parenthetical:    'dialogue',
  dialogue:         'transition',
  transition:       'shot',
  shot:             'lyrics',
  lyrics:           'dual_dialogue',
  dual_dialogue:    'sequence_heading',
  sequence_heading: 'note',
  note:             'scene_heading',
  title_page_field: 'action',
};

// What pressing Enter creates after each element
export const ENTER_CREATES: Record<ScreenplayElement, ScreenplayElement> = {
  action:           'character',
  character:        'parenthetical',
  dialogue:         'action',    //  overriden to 'character' by Tab
  parenthetical:    'dialogue',
  scene_heading:    'action',
  transition:       'scene_heading',
  shot:             'action',
  lyrics:           'action',
  dual_dialogue:    'character',
  sequence_heading: 'scene_heading',
  note:             'action',
  title_page_field: 'title_page_field',
};