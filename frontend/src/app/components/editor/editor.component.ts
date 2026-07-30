import { OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import * as Y from 'yjs';
import {
  Component, OnDestroy,
  ViewChild, ElementRef, Input, HostListener, Renderer2
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SyncService } from '../../services/sync.service';
import { VersionControlService, Branch } from '../../services/version-control.service';
import { BranchPanelComponent } from '../branch-panel/branch-panel.component';
import { DiffViewerComponent } from '../diff-viewer/diff-viewer.component';
import { CollaboratorStackComponent } from '../collaborator-stack/collaborator-stack.component';
import { BreakdownDrawerComponent } from '../breakdown-drawer/breakdown-drawer.component';
import { LocationScoutingComponent } from '../location-scouting/location-scouting.component';
import { CastingBoardComponent } from '../casting-board/casting-board.component';
import { StripboardComponent } from '../stripboard/stripboard.component';
import { BudgetEstimatorComponent } from '../budget-estimator/budget-estimator.component';
import { ShotListComponent } from '../shot-list/shot-list.component';
import { MusicVfxComponent } from '../music-vfx/music-vfx.component';
import { PressKitComponent } from '../press-kit/press-kit.component';
import { MilestoneTrackerComponent } from '../milestone-tracker/milestone-tracker.component';
import { FestivalTrackerComponent } from '../festival-tracker/festival-tracker.component';
import { CreditsComponent } from '../credits/credits.component';
import { RehearsalTrackerComponent } from '../rehearsal-tracker/rehearsal-tracker.component';
import { ContinuityNotesComponent } from '../continuity-notes/continuity-notes.component';
import { WorkflowOverviewComponent } from '../workflow-overview/workflow-overview.component';
import {
  screenplaySchema,
  ScreenplayElement,
  ELEMENT_LABELS,
  SHORTCUT_KEYS,
  TITLE_PAGE_KEYS,
} from '../../editor/screenplay-schema';
import { setBlockType } from 'prosemirror-commands';
import { Node as PMNode } from 'prosemirror-model';

const ELEMENTS: ScreenplayElement[] = [
  'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'lyrics', 'dual_dialogue', 'sequence', 'note',
];

import { toFountain, downloadFountain } from '../../editor/fountain-export';
import { MenuDropdownComponent } from '../menu-dropdown/menu-dropdown.component';
import { ModalComponent } from '../modal/modal.component';
import { fountainToPMDoc, parseFountain } from '../../editor/fountain-import';
import { findAll, selectMatch, replaceMatch, replaceAll } from '../../editor/find-replace';
import { computeScriptStats, ScriptStats } from '../../editor/script-stats';
import { exportScreenplayPdf } from '../../editor/fountain-to-pdf';
import { MembershipService } from '../../services/membership.service';
import { AutoSaveService } from '../../services/autosave.service';
import { ProjectService, Project } from '../../services/project.service';
import { ScriptService, Script } from '../../services/script.service';
import { scriptExportFilename } from '../../editor/export-filename';
import { fileToBackgroundDataUri } from '../../editor/background-image';
import { exportScreenplayJson, importScreenplayJson } from '../../editor/json-transfer';
import { exportScreenplayHtml } from '../../editor/html-export';
import { importScreenplayHtml } from '../../editor/html-import';
import { exportScreenplayDocx } from '../../editor/docx-export';
import { importDocxToText } from '../../editor/docx-import';
import { importPdfToText } from '../../editor/pdf-import';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, BranchPanelComponent, DiffViewerComponent, MenuDropdownComponent, CollaboratorStackComponent, ModalComponent, BreakdownDrawerComponent, StripboardComponent, LocationScoutingComponent, CastingBoardComponent, BudgetEstimatorComponent, ShotListComponent, MusicVfxComponent, PressKitComponent, MilestoneTrackerComponent, FestivalTrackerComponent, CreditsComponent, RehearsalTrackerComponent, ContinuityNotesComponent, WorkflowOverviewComponent],
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
})
export class EditorComponent implements OnInit, OnDestroy {
  projectId = '';
  scriptId  = '';
  collaborators:[] = []

  private _mountRef!: ElementRef<HTMLDivElement>;

  // The background image target — .editor-main itself, not <body>, so
  // it's confined to the editor's own toolbar row and the gutter around
  // the manuscript page (see applyEditorBackground below).
  @ViewChild('editorMainEl') editorMainRef?: ElementRef<HTMLElement>;

  // Page numbers for the fake-pagination illusion (see .pm-mount
  // .ProseMirror in styles.scss) — {n, top} pairs rendered as absolutely
  // positioned siblings of the ProseMirror mount, one per virtual page,
  // recomputed whenever the document's height changes.
  pageNumbers: { n: number; top: number }[] = [];
  private pageUnitPx = 0;
  private pmTopOffset = 0;
  private pageResizeObserver?: ResizeObserver;

  @ViewChild('prosemirrorMount')
  set mountRef(el: ElementRef<HTMLDivElement>) {
    if (el && !this._mountRef) {
      this._mountRef = el;
      // Start the session the moment the element appears in the DOM.
      // The callback keeps the toolbar's highlighted button in sync with
      // wherever the cursor is — the element type is already visible
      // there, so there's no separate floating indicator to maintain too.
      this.sync.startSession(
        this.scriptId,
        el.nativeElement,
        null,
        (element) => { this.activeElement = element; },
      );
      this.setupPageNumbers(el.nativeElement);
      // Apply read-only if role already loaded by this point
      if (this.myRole === 'viewer') this.makeEditorReadOnly();
      if (this.myRole !== 'viewer') {
        // Give auto-save a function that saves the current content
        // to whichever branch is currently active
        this.autoSave.setSaveFn(async () => {
          if (!this.activeBranch) return;
            const content = this.sync.getContent();
            // Overwrites the branch's draft slot rather than creating a
            // new snapshot — a writer has to explicitly hit "New
            // snapshot" for anything to land in the history list.
            // firstValueFrom actually subscribes (unlike bare `await` on
            // an Observable, which never fires the HTTP call at all).
            await firstValueFrom(this.vc.saveDraft(
              this.projectId,
              this.scriptId,
              this.activeBranch.id,
              content,
            ));
          });

          this.autoSave.start();
      }
    }
  }

  // latestSnapContent = '';
  commitMessage = '';
  activeBranch: Branch | null = null;
  showDiff = false;
  diffFromId = '';
  diffToId   = '';

  elements = ELEMENTS;
  elementLabels = ELEMENT_LABELS;
  shortcutKeys = SHORTCUT_KEYS;
  activeElement: ScreenplayElement | null = null;

  // Whether Ctrl/Cmd is currently held — the toolbar buttons swap their
  // label for the shortcut key they'd trigger while it is (⌘1–0/=,
  // matching screenplayKeymap()).
  modHeld = false;

  // These fire on every keystroke anywhere in the window, not just
  // Ctrl/Cmd — Angular runs change detection across the whole component
  // tree after every zone-patched event handler, and on a long script
  // that's real work (one binding per virtual page in pageNumbers, the
  // full history list, the autosave pipe...). Reassigning modHeld to a
  // value it's already at still triggers that whole sweep, and a held
  // modifier key can fire repeated keydown events on some browser/OS
  // combinations — so without this guard, holding Ctrl on a long
  // document could re-run a full CD pass on every repeat tick for as
  // long as it's held. Only actually changing the value earns a CD run.
  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !this.modHeld) this.modHeld = true;
  }

  @HostListener('window:keyup', ['$event'])
  onWindowKeyup(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey && this.modHeld) this.modHeld = false;
  }

  // Covers alt-tabbing away, cmd-tabbing on Mac, etc. — keyup for the
  // modifier itself doesn't fire if focus left the window first, which
  // would otherwise leave modHeld stuck true.
  @HostListener('window:blur')
  onWindowBlur(): void {
    if (this.modHeld) this.modHeld = false;
  }

  showToolbar = true;
  sidebarOpen = false; // off-canvas on mobile; CSS keeps the sidebar always visible on wider screens

  roles: string[] = ['owner', 'editor', 'viewer']
  myRole = '';
  roleLoaded = false;

  autoSaveState$ = this.autoSave.state$;

  project: Project | null = null;
  script: Script | null = null;

  constructor(
    public sync: SyncService,
    public vc: VersionControlService,
    private membership: MembershipService,
    private autoSave: AutoSaveService,  // ← add this
    private projectService: ProjectService,
    private scriptService: ScriptService,
    private renderer: Renderer2,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // ActivatedRoute.snapshot.params holds the :projectId and :scriptId
    // values from the current URL — captured by the router automatically
    this.projectId = this.route.snapshot.params['projectId'];
    this.scriptId  = this.route.snapshot.params['scriptId'];

    this.projectService.get(this.projectId).subscribe(p => {
      this.project = p;
      this.applyEditorBackground();
    });

    this.scriptService.get(this.projectId, this.scriptId).subscribe(s => this.script = s);

    // Fetch the current user's role on this project
    this.membership.getMyRole(this.projectId).subscribe({
      next: ({ role }) => {
        console.log(role)
        this.myRole = role;
        this.roleLoaded = true;
        if (role === 'viewer') this.makeEditorReadOnly();
      },
      error: () => {
        this.myRole = 'invalid';
        this.roleLoaded = true;
      }
    });
  }

  ngOnDestroy(): void {
    this.sync.endSession();
    this.autoSave.stop()
    this.pageResizeObserver?.disconnect();
    this.clearEditorBackground();
  }

  // --page-h/--page-gap are physical CSS units ("11in", ".6in"), not
  // usable directly in JS math — a throwaway probe element converts them
  // to px the same way the browser does, instead of duplicating the
  // numbers here where they could drift out of sync with styles.scss.
  private setupPageNumbers(mountEl: HTMLElement): void {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute; visibility:hidden; height:calc(var(--page-h) + var(--page-gap));';
    document.body.appendChild(probe);
    this.pageUnitPx = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);

    const update = () => {
      const pmEl = mountEl.querySelector('.ProseMirror') as HTMLElement | null;
      if (!pmEl || !this.pageUnitPx) return;
      this.pmTopOffset = pmEl.offsetTop;
      const count = Math.max(1, Math.round(pmEl.scrollHeight / this.pageUnitPx + .5));
      // Page 1 is conventionally left unnumbered in screenplay format
      // (like a title page), so numbering starts at the second page.
      this.pageNumbers = Array.from({ length: count - 1 }, (_, i) => ({
        n: i + 2,
        // Land just inside the top margin of each virtual page, matching
        // where the CSS seam itself falls ((n-1) * pageUnit).
        top: this.pmTopOffset + (i + 1) * this.pageUnitPx + 24,
      }));
    };

    this.pageResizeObserver = new ResizeObserver(update);
    this.pageResizeObserver.observe(mountEl);
    update();
  }

  applySnapshotContent(branch: Branch): void {
    // The draft slot (auto-save) is always fresher than the tip snapshot
    // when it's set — Commit() clears draftUpdatedAt the moment a real
    // snapshot lands, so a non-empty draftUpdatedAt means "load this
    // instead of the tip."
    if (branch.draftUpdatedAt) {
      this.replaceEditorContent(branch.draftContent ?? '');
      return;
    }

    if (!branch.tipId) return;
    this.vc.getSnapshot(this.projectId, this.scriptId, branch.id, branch.tipId).subscribe(snap => {
      if (!snap?.content) return;
      this.replaceEditorContent(snap.content);
    });
  }

  // Parses Fountain-style plain text (what Fountain/DOC/PDF/HTML import
  // all funnel through — see importDocx/importPdf/importHtml below) and
  // replaces the editor's content with it.
  private replaceEditorContent(content: string): void {
    const parsed = parseFountain(content);
    const newDoc = fountainToPMDoc(parsed);
    this.replaceEditorContentWithDoc(newDoc);
  }

  // JSON import (json-transfer.ts) already produces a full ProseMirror
  // doc directly — a lossless round-trip, unlike the other import
  // formats — so it replaces content here without going through
  // parseFountain at all.
  private replaceEditorContentWithDoc(newDoc: PMNode): void {
    const session = (this.sync as any).session;
    if (!session) return;

    const view = session.view;
    const ydoc: Y.Doc = session.doc;

    // Instead of replacing ProseMirror state directly, we update
    // the Yjs document — ySyncPlugin will then sync the new content
    // into ProseMirror automatically.
    //
    // We do this by applying a ProseMirror transaction that replaces
    // the entire document content, wrapped in a Yjs transaction so
    // the change is tracked by the CRDT.
    ydoc.transact(() => {
      const { tr } = view.state;
      tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
      view.dispatch(tr);
    });
  }

  // Hidden <input type=file>, clicked programmatically — the standard
  // browser pattern for a file picker without a visible form control.
  // Shared by every import format below instead of each rebuilding it.
  private pickFile(accept: string): Promise<File | null> {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = (event: Event) => {
        resolve((event.target as HTMLInputElement).files?.[0] ?? null);
      };
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
    });
  }

  onBranchSelected(branch: Branch): void {
    this.sidebarOpen = false; // auto-close the off-canvas drafts panel on mobile
    const previousBranch = this.activeBranch;

    const switchTo = () => {
      this.activeBranch = branch;
      // Nothing to load if there's neither a tip snapshot nor a draft
      if (!branch.tipId && !branch.draftUpdatedAt) return;
      this.applySnapshotContent(branch);
    };

    // Save the work on the branch we're leaving — to its draft slot, not
    // as a new snapshot — before loading the new content.
    if (previousBranch && previousBranch.id !== branch.id && this.canEdit) {
      const content = this.sync.getContent();
      firstValueFrom(this.vc.saveDraft(
        this.projectId,
        this.scriptId,
        previousBranch.id,
        content,
      )).then(
        () => switchTo(),
        // Don't let a failed save block the branch switch — the user's
        // local content is still in the editor either way.
        (err) => {
          console.error('Saving draft before branch switch failed:', err);
          switchTo();
        },
      );
    } else {
      switchTo();
    }
  }

  // Driven by the branch panel's auto-save slider — 0 is the "off" dot,
  // anything else both enables auto-save (if it wasn't already) and
  // sets the interval in one motion, since the slider collapses what
  // used to be two separate Tools-menu actions into a single control.
  onAutoSaveIntervalChange(minutes: 0 | 1 | 2 | 5 | 10): void {
    if (minutes === 0) {
      this.autoSave.setEnabled(false);
      return;
    }
    if (!this.autoSave.state$.getValue().enabled) this.autoSave.setEnabled(true);
    this.autoSave.setInterval(minutes);
  }

  showWordCount = false;
  wordCount = 0;

  openWordCount(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    this.wordCount = computeScriptStats(view.state.doc).wordCount;
    this.showWordCount = true;
  }

  showScriptStats = false;
  scriptStats: ScriptStats | null = null;

  openScriptStats(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    this.scriptStats = computeScriptStats(view.state.doc);
    this.showScriptStats = true;
  }

  setElement(element: ScreenplayElement): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    const nodeType = (screenplaySchema.nodes as any)[element];
    if (!nodeType) return;
    setBlockType(nodeType, { element })(view.state, view.dispatch);
    this.activeElement = element
    console.log(this.activeElement)
    view.focus();
  }

  saveSnapshot(): void {
    if (!this.activeBranch || !this.commitMessage.trim()) return;
    const content = this.sync.getContent();
    this.vc
      .commit(this.projectId, this.scriptId, this.activeBranch.id, content, this.commitMessage)
      .subscribe(snap => {
        console.log('Snapshot saved:', snap.id);
        this.commitMessage = '';
        this.autoSave.markSaved();
      });
  }

  // File menu's "Save draft" — a manual, on-demand version of the exact
  // same save autoSave already runs on a timer (registered via
  // autoSave.setSaveFn in the prosemirrorMount setter above), so it picks
  // up the same saving/lastSaved state the sidebar already shows.
  saveDraftNow(): void {
    if (!this.activeBranch || !this.canEdit) return;
    this.autoSave.triggerSave();
  }

  openDiff(fromId: string, toId: string): void {
    this.diffFromId = fromId;
    this.diffToId   = toId;
    this.showDiff   = true;
  }

  // ── File menu ────────────────────────────────────────────────────

  insertTitlePage(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;

    const first = view.state.doc.firstChild;
    if (first && first.attrs['element'] === 'title_page_field') {
      alert('This script already has a title page.');
      return;
    }

    const fieldType = screenplaySchema.nodes['title_page_field'];
    const nodes = TITLE_PAGE_KEYS.slice(0, 3).map(key =>  // Title, Credit, Author
      fieldType.create({ element: 'title_page_field', key })
    );
    view.dispatch(view.state.tr.insert(0, nodes));
    view.focus();
  }

  private get exportFilename(): string {
    return scriptExportFilename(this.script?.title, this.scriptId);
  }

  showImportModal = false;
  showExportModal = false;

  openImportModal(): void {
    this.showImportModal = true;
  }

  openExportModal(): void {
    this.showExportModal = true;
  }

  chooseImport(format: 'fountain' | 'docx' | 'pdf' | 'json' | 'html'): void {
    this.showImportModal = false;
    switch (format) {
      case 'fountain': this.importFountain(); break;
      case 'docx': this.importDocx(); break;
      case 'pdf': this.importPdf(); break;
      case 'json': this.importJson(); break;
      case 'html': this.importHtml(); break;
    }
  }

  chooseExport(format: 'fountain' | 'docx' | 'pdf' | 'json' | 'html'): void {
    this.showExportModal = false;
    switch (format) {
      case 'fountain': this.exportFountain(); break;
      case 'docx': this.exportDocx(); break;
      case 'pdf': this.exportPDF(); break;
      case 'json': this.exportJson(); break;
      case 'html': this.exportHtml(); break;
    }
  }

  exportFountain(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;

    const fountainText = toFountain(view.state.doc);
    downloadFountain(fountainText, this.exportFilename);
  }

  showPdfPasswordModal = false;
  pdfPassword = '';

  exportPDF(): void {
    this.pdfPassword = '';
    this.showPdfPasswordModal = true;
  }

  confirmPdfExport(usePassword: boolean): void {
    const view = (this.sync as any).session?.view;
    this.showPdfPasswordModal = false;
    if (!view) return;

    exportScreenplayPdf(view.state.doc, {
      filename: this.exportFilename,
      password: usePassword && this.pdfPassword.trim() ? this.pdfPassword.trim() : undefined,
    }).catch(err => console.error('PDF export failed:', err));
  }

  async importFountain(): Promise<void> {
    const file = await this.pickFile('.fountain,.txt');
    if (!file) return;
    this.replaceEditorContent(await file.text());
    (this.sync as any).session?.view?.focus();
  }

  exportJson(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    exportScreenplayJson(view.state.doc, this.exportFilename);
  }

  async importJson(): Promise<void> {
    const file = await this.pickFile('.json');
    if (!file) return;
    try {
      this.replaceEditorContentWithDoc(importScreenplayJson(await file.text()));
    } catch (err) {
      console.error('JSON import failed:', err);
      alert('Could not import that file — it may not be a Bulwriter JSON export.');
    }
  }

  exportHtml(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    exportScreenplayHtml(view.state.doc, this.exportFilename);
  }

  async importHtml(): Promise<void> {
    const file = await this.pickFile('.html,.htm');
    if (!file) return;
    try {
      this.replaceEditorContentWithDoc(await importScreenplayHtml(file));
    } catch (err) {
      console.error('HTML import failed:', err);
      alert('Could not import that HTML file.');
    }
  }

  async exportDocx(): Promise<void> {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    try {
      await exportScreenplayDocx(view.state.doc, this.exportFilename);
    } catch (err) {
      console.error('DOCX export failed:', err);
    }
  }

  async importDocx(): Promise<void> {
    const file = await this.pickFile('.docx');
    if (!file) return;
    try {
      this.replaceEditorContent(await importDocxToText(file));
    } catch (err) {
      console.error('DOCX import failed:', err);
      alert('Could not import that Word document.');
    }
  }

  async importPdf(): Promise<void> {
    const file = await this.pickFile('.pdf');
    if (!file) return;
    try {
      this.replaceEditorContent(await importPdfToText(file));
    } catch (err) {
      console.error('PDF import failed:', err);
      alert('Could not import that PDF.');
    }
  }

  // ── Edit menu ────────────────────────────────────────────────────

  undo(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    // 'undo' command comes from prosemirror-history, registered
    // via yUndoPlugin — Mod-z is already bound, this just triggers
    // the same command from the menu
    import('prosemirror-history').then(({ undo }) => {
      undo(view.state, view.dispatch);
      view.focus();
    });
  }

  redo(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    import('prosemirror-history').then(({ redo }) => {
      redo(view.state, view.dispatch);
      view.focus();
    });
  }

  showFindReplace = false;
  findTerm = '';
  replaceTerm = '';
  matchCase = false;
  findMatchCount: number | null = null; // null = haven't searched yet
  private findMatchIndex = -1;

  openFindReplace(): void {
    this.showFindReplace = true;
    this.findMatchCount = null;
    this.findMatchIndex = -1;
  }

  closeFindReplace(): void {
    this.showFindReplace = false;
  }

  findNext(): void {
    const view = (this.sync as any).session?.view;
    if (!view || !this.findTerm) return;

    const matches = findAll(view, this.findTerm, this.matchCase);
    this.findMatchCount = matches.length;
    if (!matches.length) {
      this.findMatchIndex = -1;
      return;
    }

    this.findMatchIndex = (this.findMatchIndex + 1) % matches.length;
    selectMatch(view, matches[this.findMatchIndex]);
  }

  replaceCurrent(): void {
    const view = (this.sync as any).session?.view;
    if (!view || !this.findTerm || !this.canEdit) return;

    const matches = findAll(view, this.findTerm, this.matchCase);
    this.findMatchCount = matches.length;
    if (!matches.length) return;

    // If the current selection already IS the match at findMatchIndex,
    // replace it in place — otherwise just land on it first, same as
    // Find Next, so a bare click of Replace never eats the wrong text.
    const { from, to } = view.state.selection;
    const current = matches[this.findMatchIndex];
    if (current && current.from === from && current.to === to) {
      replaceMatch(view, current, this.replaceTerm);
      // Positions after this match shifted by the length delta — redo
      // the search fresh rather than trying to patch the old list.
      this.findMatchIndex = -1;
    }
    this.findNext();
  }

  replaceAllOccurrences(): void {
    const view = (this.sync as any).session?.view;
    if (!view || !this.findTerm || !this.canEdit) return;

    replaceAll(view, this.findTerm, this.replaceTerm, this.matchCase);
    this.findMatchCount = 0; // everything just got replaced — nothing left to find
    this.findMatchIndex = -1;
  }

  // ── View menu ────────────────────────────────────────────────────

  toggleToolbar(): void {
    this.showToolbar = !this.showToolbar;
  }

  // ── Share menu ───────────────────────────────────────────────────

  goToCollaborators(): void {
    // Navigate back to the project page where collaborators live
    this.router.navigate(['/projects', this.projectId]);
  }

  // ── Tools menu: background image ────────────────────────────────
  // A project-wide personalization behind the editor's own chrome
  // (toolbar row + the open gutter around the page) — deliberately
  // excluded from the manuscript page itself (.page-chrome / .pm-mount
  // stay opaque) so it never competes with the actual script, and
  // excluded from the navbar/sidebar (branch panel, collaborators),
  // which live outside .editor-main entirely and so never see it.
  // Applied via Renderer2 to the #editorMainEl ViewChild rather than a
  // template binding since it's imperative, event-driven state (set on
  // load, on upload, on remove), not something derived every render.

  private backgroundLayerValue(): string {
    if (!this.project?.backgroundImage) return 'none';
    // A light tint in the app's own --bg colour, layered under the
    // image — keeps text over it readable without crushing the image
    // down to nothing. The toolbar row goes fully transparent under
    // .editor-main.has-bg-image (see styles.scss) so it shows exactly
    // this same layer, not a second faded copy stacked on top of it.
    return `linear-gradient(rgba(246, 241, 230, .6), rgba(246, 241, 230, .6)), url("${this.project.backgroundImage}")`;
  }

  private applyEditorBackground(): void {
    if (!this.project?.backgroundImage) {
      this.clearEditorBackground();
      return;
    }
    const el = this.editorMainRef?.nativeElement;
    if (!el) return;
    this.renderer.setStyle(el, '--project-bg-layer', this.backgroundLayerValue());
    this.renderer.addClass(el, 'has-bg-image');
  }

  private clearEditorBackground(): void {
    const el = this.editorMainRef?.nativeElement;
    if (!el) return;
    this.renderer.removeStyle(el, '--project-bg-layer');
    this.renderer.removeClass(el, 'has-bg-image');
  }

  uploadBackgroundImage(): void {
    if (!this.isOwner) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      let dataUri: string;
      try {
        dataUri = await fileToBackgroundDataUri(file);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Could not process that image.');
        return;
      }

      this.projectService.setBackground(this.projectId, dataUri).subscribe({
        next: () => {
          if (this.project) this.project = { ...this.project, backgroundImage: dataUri };
          this.applyEditorBackground();
        },
        error: () => alert('Could not upload background image.'),
      });
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  removeBackgroundImage(): void {
    if (!this.isOwner) return;
    this.projectService.clearBackground(this.projectId).subscribe({
      next: () => {
        if (this.project) this.project = { ...this.project, backgroundImage: undefined };
        this.clearEditorBackground();
      },
    });
  }

  // ── Production menu ──────────────────────────────────────────────

  showBreakdown = false;
  showStripboard = false;
  showScouting = false;
  showCasting = false;
  showBudget = false;
  showShotList = false;
  showMusicVfx = false;
  showPressKit = false;
  showMilestones = false;
  showFestivalTracker = false;
  showCredits = false;
  showRehearsals = false;
  showContinuity = false;
  showWorkflowOverview = false;

  openBreakdown(): void {
    this.showBreakdown = true;
  }

  openScouting(): void {
    this.showScouting = true;
  }

  openStripboard(): void {
    this.showStripboard = true;
  }

  openCasting(): void {
    this.showCasting = true;
  }

  openBudget(): void {
    this.showBudget = true;
  }

  openShotList(): void {
    this.showShotList = true;
  }

  openMusicVfx(): void {
    this.showMusicVfx = true;
  }

  openRehearsals(): void {
    this.showRehearsals = true;
  }

  openContinuity(): void {
    this.showContinuity = true;
  }

  openPressKit(): void {
    this.showPressKit = true;
  }

  openMilestones(): void {
    this.showMilestones = true;
  }

  openFestivalTracker(): void {
    this.showFestivalTracker = true;
  }

  openCredits(): void {
    this.showCredits = true;
  }

  openWorkflowOverview(): void {
    this.showWorkflowOverview = true;
  }

  // Dispatches a workflow-overview row click to the matching drawer's
  // own open method — keeps the mapping in one place rather than
  // wiring 11 separate (openFeature)="..." handlers in the template.
  onWorkflowFeature(key: string): void {
    this.showWorkflowOverview = false;
    switch (key) {
      case 'breakdown': this.openBreakdown(); break;
      case 'casting': this.openCasting(); break;
      case 'scouting': this.openScouting(); break;
      case 'stripboard': this.openStripboard(); break;
      case 'budget': this.openBudget(); break;
      case 'shotlist': this.openShotList(); break;
      case 'rehearsals': this.openRehearsals(); break;
      case 'musicvfx': this.openMusicVfx(); break;
      case 'continuity': this.openContinuity(); break;
      case 'milestones': this.openMilestones(); break;
      case 'credits': this.openCredits(); break;
      case 'presskit': this.openPressKit(); break;
      case 'festival': this.openFestivalTracker(); break;
    }
  }

  // ── Revisions menu ───────────────────────────────────────────────

  scrollToHistory(): void {
    // The branch panel is in the sidebar — just a visual nudge for now
    document.querySelector('.history-list')?.scrollIntoView({ behavior: 'smooth' });
  }

  createBranchPrompt(): void {
    // Focus the "new branch" input in the sidebar
    const input = document.querySelector<HTMLInputElement>('.new-branch input');
    input?.focus();
  }

  // ── Help menu ────────────────────────────────────────────────────

  showShortcuts = false;

  shortcutList: { keys: string; label: string }[] = [
    // { keys: 'Tab',   label: 'Cycle element type' },
    { keys: 'Enter', label: 'New line (smart element)' },
    { keys: '⌘1',    label: 'Scene' },
    { keys: '⌘2',    label: 'Action' },
    { keys: '⌘3',    label: 'Character' },
    { keys: '⌘4',    label: 'Dialogue' },
    { keys: '⌘5',    label: 'Parenthetical' },
    { keys: '⌘6',    label: 'Transition' },
    { keys: '⌘7',    label: 'Shot' },
    { keys: '⌘8',    label: 'Lyrics' },
    { keys: '⌘9',    label: 'Dual Dialogue' },
    { keys: '⌘0',    label: 'Sequence' },
    { keys: '⌘=',    label: 'Note' },
    { keys: '⌘B',    label: 'Bold' },
    { keys: '⌘I',    label: 'Italic' },
    { keys: '⌘U',    label: 'Underline' },
  ];

  openShortcuts(): void {
    this.showShortcuts = true;
  }

  private makeEditorReadOnly(): void {
    // ProseMirror supports read-only mode via the `editable` prop.
    // We wait a tick to ensure the view has mounted before updating it.
    setTimeout(() => {
      const view = (this.sync as any).session?.view;
      if (!view) return;
      view.setProps({ editable: () => false });
    }, 100);
  }
  
  // Convenience getters used in the template to show/hide UI
  get isOwner(): boolean { return this.myRole === 'owner'; }
  get canEdit(): boolean { return this.myRole === 'owner' || this.myRole === 'editor'; }
}
