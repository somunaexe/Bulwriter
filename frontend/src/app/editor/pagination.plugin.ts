import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';

// Real print geometry at 96 CSS px/in — the same numbers --script-width
// and fountain-to-pdf.ts already use (816px == 8.5in, 1056px == 11in), so
// the on-screen page and the exported PDF page are the same physical
// size. Pagination always measures at this canonical width regardless of
// viewport — PageScaleController (below) shrinks the *display* on narrow
// screens rather than letting content reflow into a narrower column,
// which would change line-wrapping (and therefore page breaks) per
// viewport. A visual gap between page cards is the fixed geometry:
// nothing here is proportional to it.
const PAGE_W = 816;
const PAGE_H = 1056;
const MARGIN_TOP = 96;
const MARGIN_BOTTOM = 96;
const MARGIN_RIGHT = 96;
const MARGIN_LEFT = 144; // 1.5in — binding edge, matches fountain-to-pdf.ts
const GAP = 28;
const CONTENT_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;

const paginationKey = new PluginKey<PaginationState>('pagination');

interface PaginationState {
  decorations: DecorationSet;
  pageCount: number;
}

interface PageBreak {
  pos: number;
  spacerHeight: number;
}

/** Walks the doc's top-level blocks in their *current* rendered layout
 *  (before any of our own spacer decorations exist — a block's own
 *  height is intrinsic to its content, unaffected by spacer siblings
 *  elsewhere, so this measurement stays valid even on the recompute
 *  right after a previous one already inserted spacers) and decides
 *  which ones should start a new page.
 *
 *  Block-level only, deliberately: a break can land between two
 *  top-level nodes (scene heading, action, dialogue, ...), never inside
 *  one. A single block taller than a full page's content height is left
 *  to overflow its page uninterrupted — a known v1 limitation, not a
 *  bug — full parity with fountain-to-pdf.ts's line-by-line breaking
 *  would need measuring positions *inside* a block's text, which this
 *  intentionally doesn't attempt yet. */
function measureBreaks(view: EditorView): { breaks: PageBreak[]; pageCount: number } {
  const breaks: PageBreak[] = [];
  let used = 0;
  let pageCount = 1;

  view.state.doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;

    const rect = dom.getBoundingClientRect();
    const marginBottom = parseFloat(getComputedStyle(dom).marginBottom || '0');
    const h = rect.height + marginBottom;

    // used === 0 means this is the first block on its page — always
    // keep at least one block per page even if it alone overflows, or
    // every subsequent block would "break" onto an endless run of
    // empty pages trying to escape it.
    if (used > 0 && used + h > CONTENT_H) {
      breaks.push({ pos: offset, spacerHeight: (CONTENT_H - used) + MARGIN_BOTTOM + GAP + MARGIN_TOP });
      pageCount++;
      used = h;
    } else {
      used += h;
    }
  });

  return { breaks, pageCount };
}

function buildDecorations(doc: EditorView['state']['doc'], breaks: PageBreak[]): DecorationSet {
  const decos = breaks.map(b =>
    Decoration.widget(
      b.pos,
      () => {
        const el = document.createElement('div');
        el.className = 'pm-page-break-spacer';
        el.style.height = `${b.spacerHeight}px`;
        el.contentEditable = 'false';
        return el;
      },
      { side: -1, key: `page-break-${b.pos}` }
    )
  );
  return DecorationSet.create(doc, decos);
}

/** Owns the DOM chrome pagination needs beyond what ProseMirror itself
 *  renders: the page-card backgrounds (the white "sheets" with the
 *  border/shadow/page-number that make separate pages actually look
 *  separate) and the scale wrapper that shrinks the whole thing
 *  proportionally on narrow viewports. Reparents editorView.dom once at
 *  construction time — safe because ProseMirror only cares that its own
 *  dom stays attached to the document, not what wraps it. */
class PageChrome {
  private scaleOuter = document.createElement('div');
  private frame = document.createElement('div');
  private bgLayer = document.createElement('div');
  private resizeObserver: ResizeObserver;
  private pageCount = 1;

  constructor(private view: EditorView) {
    this.scaleOuter.className = 'pm-scale-outer';
    this.frame.className = 'pm-page-frame';
    this.bgLayer.className = 'pm-page-bg-layer';

    const mount = view.dom.parentElement!;
    mount.insertBefore(this.scaleOuter, view.dom);
    this.scaleOuter.appendChild(this.frame);
    this.frame.appendChild(this.bgLayer);
    this.frame.appendChild(view.dom);

    this.resizeObserver = new ResizeObserver(() => this.syncScale());
    this.resizeObserver.observe(mount);
    this.syncScale();
  }

  syncPageCount(pageCount: number): void {
    this.pageCount = pageCount;

    while (this.bgLayer.children.length > pageCount) {
      this.bgLayer.removeChild(this.bgLayer.lastElementChild!);
    }
    while (this.bgLayer.children.length < pageCount) {
      const card = document.createElement('div');
      card.className = 'pm-page-card';
      const num = document.createElement('span');
      num.className = 'pm-page-number';
      card.appendChild(num);
      this.bgLayer.appendChild(card);
    }
    for (let i = 0; i < pageCount; i++) {
      const card = this.bgLayer.children[i] as HTMLElement;
      card.style.top = `${i * (PAGE_H + GAP)}px`;
      (card.firstElementChild as HTMLElement).textContent = `${i + 1}.`;
    }

    const totalHeight = pageCount * PAGE_H + (pageCount - 1) * GAP;
    this.bgLayer.style.height = `${totalHeight}px`;
    // The frame's own height comes from its normal-flow content
    // (editorView.dom, sized by real text + spacers) — take the larger
    // of that and the formula-derived background height so a rounding
    // drift between the two never clips the last page's card short.
    this.frame.style.minHeight = `${totalHeight}px`;
    this.syncScale();
  }

  private syncScale(): void {
    const mount = this.view.dom.closest('.pm-mount') as HTMLElement | null;
    if (!mount) return;

    // Comfortable side breathing room so the page never touches the
    // scrollable container's edge — matches .pm-mount's own padding.
    const available = mount.clientWidth - 32;
    const scale = Math.max(0.001, Math.min(1, available / PAGE_W));

    this.frame.style.transform = `scale(${scale})`;
    this.scaleOuter.style.width = `${PAGE_W * scale}px`;
    this.scaleOuter.style.height = `${(this.pageCount * PAGE_H + (this.pageCount - 1) * GAP) * scale}px`;
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    // Put editorView.dom back as a direct child of .pm-mount so nothing
    // is left referencing a DOM node this class is about to discard.
    const mount = this.view.dom.closest('.pm-mount');
    mount?.appendChild(this.view.dom);
    this.scaleOuter.remove();
  }
}

/** Emulates Google Docs-style pagination: a single continuous
 *  ProseMirror/Yjs document underneath (nothing about the data model or
 *  collab sync changes), with page boundaries computed from real
 *  rendered DOM measurements and drawn as decorations — never a blind
 *  repeating CSS pattern, which is what made an earlier attempt here
 *  land breaks mid-word (see the removed comment this replaces in
 *  styles.scss's history). See pagination.plugin.ts's module comment
 *  for the geometry this measures against. */
export function paginationPlugin(): Plugin {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let chrome: PageChrome | null = null;

  const recompute = (view: EditorView): void => {
    if (view.isDestroyed) return;
    const { breaks, pageCount } = measureBreaks(view);
    const decorations = buildDecorations(view.state.doc, breaks);
    // No document steps, only plugin-state meta — invisible to Yjs sync
    // and to yUndoPlugin's history, exactly like yCursorPlugin's own
    // awareness-driven redraws.
    view.dispatch(view.state.tr.setMeta(paginationKey, { decorations, pageCount }));
    chrome?.syncPageCount(pageCount);
  };

  return new Plugin<PaginationState>({
    key: paginationKey,
    state: {
      init: () => ({ decorations: DecorationSet.empty, pageCount: 1 }),
      apply(tr, prev) {
        const meta = tr.getMeta(paginationKey);
        if (meta) return meta;
        return prev.decorations === DecorationSet.empty
          ? prev
          : { decorations: prev.decorations.map(tr.mapping, tr.doc), pageCount: prev.pageCount };
      },
    },
    props: {
      decorations(state) {
        return paginationKey.getState(state)?.decorations ?? null;
      },
    },
    view(editorView) {
      chrome = new PageChrome(editorView);
      // Initial measurement, once the view has actually painted.
      requestAnimationFrame(() => recompute(editorView));

      return {
        update(view, prevState) {
          if (view.state.doc.eq(prevState.doc)) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            recompute(view);
          }, 220);
        },
        destroy() {
          if (debounceTimer) clearTimeout(debounceTimer);
          chrome?.destroy();
          chrome = null;
        },
      };
    },
  });
}
