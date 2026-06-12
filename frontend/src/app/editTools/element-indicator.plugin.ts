import { Plugin, PluginKey } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ScreenplayElement, ELEMENT_LABELS } from './screenplay-schema';

const indicatorKey = new PluginKey('elementIndicator');

/** Returns the screenplay element at the cursor, or null. */
function getElement(view: EditorView): ScreenplayElement | null {
  const { $from } = view.state.selection;
  return ($from.parent.attrs['element'] as ScreenplayElement) ?? null;
}

/**
 * A ProseMirror plugin that renders a small element-type indicator
 * above the current line. It reads the current block's element attribute
 * and updates a DOM node passed in at construction time.
 */
export function elementIndicatorPlugin(
  indicatorEl: HTMLElement
): Plugin {
  return new Plugin({
    key: indicatorKey,
    view(editorView) {
      function update() {
        const el = getElement(editorView);
        if (el) {
          indicatorEl.textContent = ELEMENT_LABELS[el];
          indicatorEl.setAttribute('data-element', el);
          indicatorEl.style.display = 'block';
        } else {
          indicatorEl.style.display = 'none';
        }
      }
      update();
      return { update };
    },
  });
}