import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model';

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

// Element type helpers
export type ScreenplayElement =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition';

export const ELEMENT_LABELS: Record<ScreenplayElement, string> = {
  scene_heading:  'Scene heading',
  action:         'Action',
  character:      'Character',
  dialogue:       'Dialogue',
  parenthetical:  'Parenthetical',
  transition:     'Transition',
};

// Tab cycles through this sequence
export const TAB_CYCLE: Record<ScreenplayElement, ScreenplayElement> = {
  action:        'character',
  character:     'dialogue',
  dialogue:      'action',
  parenthetical: 'dialogue',
  scene_heading: 'action',
  transition:    'action',
};

// What pressing Enter creates after each element
export const ENTER_CREATES: Record<ScreenplayElement, ScreenplayElement> = {
  scene_heading:  'action',
  action:         'action',
  character:      'dialogue',
  dialogue:       'action',      // overridden to 'character' by Tab
  parenthetical:  'dialogue',
  transition:     'scene_heading',
};