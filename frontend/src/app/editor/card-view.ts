import { Node as PMNode } from 'prosemirror-model';
import { ScreenplayElement } from './screenplay-schema';

export interface CardBlock {
  element: ScreenplayElement;
  text: string;
}

export interface SceneCard {
  number: number;
  heading: string;
  // The scene heading node's doc position — jumpToScene (editor.component.ts)
  // resolves a selection there to scroll Page View back to this scene.
  pos: number;
  blocks: CardBlock[];
}

/** Groups the document's top-level blocks into one card per scene, same
 *  "walk once, group by the last scene heading seen" approach as
 *  scene-breakdown.ts's computeSceneList — this just keeps every line in
 *  the scene (for display) instead of only the cast. Content before the
 *  first scene heading (a title page, or action typed before any scene
 *  exists yet) has no card to attach to and is skipped, same as there. */
export function computeSceneCards(doc: PMNode): SceneCard[] {
  const cards: SceneCard[] = [];
  let current: SceneCard | null = null;

  doc.forEach((node, offset) => {
    const element = node.attrs['element'] as ScreenplayElement | undefined;
    if (!element || element === 'title_page_field') return;

    const text = node.textContent;

    if (element === 'scene') {
      current = {
        number: cards.length + 1,
        heading: text.trim() || `Untitled scene ${cards.length + 1}`,
        pos: offset,
        blocks: [],
      };
      cards.push(current);
      return;
    }

    if (!current || !text.trim()) return;
    current.blocks.push({ element, text });
  });

  return cards;
}
