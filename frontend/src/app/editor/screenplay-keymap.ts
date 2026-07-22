import { keymap } from 'prosemirror-keymap';
import { Plugin, TextSelection } from 'prosemirror-state';
import { EditorState, Transaction } from 'prosemirror-state';
import { Node, NodeType } from 'prosemirror-model';
import {
  screenplaySchema,
  ScreenplayElement,
  TAB_CYCLE,
  ENTER_CREATES,
} from './screenplay-schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the screenplay element type of the block the cursor is in. */
function currentElement(state: EditorState): ScreenplayElement | null {
  const { $from } = state.selection;
  const node = $from.parent;
  const el = node.attrs['element'] as ScreenplayElement | undefined;
  return el ?? null;
}

/** Replace the current block's node type with a new screenplay element. */
function setElement(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  element: ScreenplayElement
): boolean {
  const nodeType: NodeType = (screenplaySchema.nodes as any)[element];
  if (!nodeType) return false;

  const { $from, $to } = state.selection;
  // Only act on a single-block selection
  if ($from.depth === 0) return false;

  const tr = state.tr.setBlockType($from.pos, $to.pos, nodeType, { element });

  // Auto-uppercase scene headings and characters and transitions as typed
  dispatch?.(tr.scrollIntoView());
  return true;
}

/** Insert a new paragraph of the given element type after the current block. */
function insertElement(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  element: ScreenplayElement
): boolean {
  const nodeType: NodeType = (screenplaySchema.nodes as any)[element];
  if (!nodeType) return false;

  const { $from } = state.selection;
  const after = $from.after($from.depth);
  const node = nodeType.create({ element });
  const insertTr = state.tr.insert(after, node);
  const tr = insertTr.setSelection(
    TextSelection.near(insertTr.doc.resolve(after + 1))
  );
  dispatch?.(tr.scrollIntoView());
  return true;
}

// ---------------------------------------------------------------------------
// Tab — cycle element type
// ---------------------------------------------------------------------------

function handleTab(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined
): boolean {
  const el = currentElement(state);
  if (!el) return false;
  const next = TAB_CYCLE[el];
  return setElement(state, dispatch, next);
}

// Shift-Tab goes backwards (simplified: goes to action)
function handleShiftTab(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined
): boolean {
  const el = currentElement(state);
  if (!el) return false;
  // Reverse cycle: dialogue→character, character→action, anything→scene_heading
  const reverse: Record<ScreenplayElement, ScreenplayElement> = {
    scene_heading: 'note',
    action: 'scene_heading',
    character: 'action',
    parenthetical: 'character',
    dialogue: 'parenthetical',
    transition: 'dialogue',
    shot: 'transition',
    lyrics: 'shot',
    dual_dialogue: 'lyrics',
    sequence_heading: 'dual_dialogue',
    note: 'sequence_heading',
    title_page_field: 'action',
  };
  return setElement(state, dispatch, reverse[el]);
}

// ---------------------------------------------------------------------------
// Enter — create next logical element
// ---------------------------------------------------------------------------

function handleEnter(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined
): boolean {
  const el = currentElement(state);
  if (!el) return false;

  const { $from } = state.selection;
  const isEmpty = $from.parent.content.size === 0;

  // Empty character line → convert to action (writer changed their mind)
  if (el === 'character' && isEmpty) {
    return setElement(state, dispatch, 'action');
  }

  // Empty dialogue line → convert to action
  if (el === 'dialogue' && isEmpty) {
    return setElement(state, dispatch, 'action');
  }

  const next = ENTER_CREATES[el];
  return insertElement(state, dispatch, next);
}

// ---------------------------------------------------------------------------
// Auto-uppercase for scene headings, characters, transitions
// ---------------------------------------------------------------------------

export function autoUppercasePlugin(): Plugin {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        const el = currentElement(view.state);
        if (
          el === 'scene_heading' ||
          el === 'character' ||
          el === 'transition' ||
          el === 'lyrics' ||
          el === 'shot'
        ) {
          const upper = text.toUpperCase();
          if (upper !== text) {
            const tr = view.state.tr.insertText(upper, from, to);
            view.dispatch(tr);
            return true;
          }
        }
        return false;
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Exported keymap plugin
// ---------------------------------------------------------------------------

export function screenplayKeymap(): Plugin {
  return keymap({
    Tab:        handleTab,
    'Shift-Tab': handleShiftTab,
    Enter:       handleEnter,

    // Ctrl/Cmd + number keys for quick element switching
    'Mod-1': (state, dispatch) => setElement(state, dispatch, 'scene_heading'),
    'Mod-2': (state, dispatch) => setElement(state, dispatch, 'action'),
    'Mod-3': (state, dispatch) => setElement(state, dispatch, 'character'),
    'Mod-4': (state, dispatch) => setElement(state, dispatch, 'dialogue'),
    'Mod-5': (state, dispatch) => setElement(state, dispatch, 'parenthetical'),
    'Mod-6': (state, dispatch) => setElement(state, dispatch, 'transition'),
    'Mod-7': (state, dispatch) => setElement(state, dispatch, 'shot'),
    'Mod-8': (state, dispatch) => setElement(state, dispatch, 'lyrics'),
    'Mod-9': (state, dispatch) => setElement(state, dispatch, 'dual_dialogue'),
    'Mod-0': (state, dispatch) => setElement(state, dispatch, 'sequence_heading'),
    'Mod--': (state, dispatch) => setElement(state, dispatch, 'note'),
  });
}