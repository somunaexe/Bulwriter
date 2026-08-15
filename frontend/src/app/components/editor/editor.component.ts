import { OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import * as Y from 'yjs';
import {
  Component, OnDestroy, inject,
  ViewChild, ElementRef, Input, HostListener
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
import { BudgetEstimatorComponent, PendingBudgetSelection } from '../budget-estimator/budget-estimator.component';
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
  // TITLE_PAGE_KEYS, // only used by the title page feature, scrapped for now — see editor.component.html
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
import { ClerkService } from '../../services/clerk.service';
import { AutoSaveService } from '../../services/autosave.service';
import { ProjectService, Project } from '../../services/project.service';
import { ScriptService, Script } from '../../services/script.service';
import { scriptExportFilename } from '../../editor/export-filename';
import { exportScreenplayJson, importScreenplayJson } from '../../editor/json-transfer';
import { exportScreenplayHtml } from '../../editor/html-export';
import { importScreenplayHtml } from '../../editor/html-import';
import { exportScreenplayDocx } from '../../editor/docx-export';
import { importDocxToText } from '../../editor/docx-import';
import { importPdfToText } from '../../editor/pdf-import';
import { applyLink, removeLink, insertImage } from '../../editor/link-image';
import { findBudgetMarkPos } from '../../editor/budget-mark';
import { fileToBackgroundDataUri } from '../../editor/background-image';
import { renameCharacter, listCharacterNames } from '../../editor/rename-character';
import { computeSceneCards, SceneCard } from '../../editor/card-view';
import { TextSelection } from 'prosemirror-state';
import { pickFile } from '../../editor/pick-file';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, BranchPanelComponent, DiffViewerComponent, MenuDropdownComponent, CollaboratorStackComponent, ModalComponent, BreakdownDrawerComponent, StripboardComponent, LocationScoutingComponent, CastingBoardComponent, BudgetEstimatorComponent, ShotListComponent, MusicVfxComponent, PressKitComponent, MilestoneTrackerComponent, FestivalTrackerComponent, CreditsComponent, RehearsalTrackerComponent, ContinuityNotesComponent, WorkflowOverviewComponent],
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
})
export class EditorComponent implements OnInit, OnDestroy {
  private clerk = inject(ClerkService);

  projectId = '';
  scriptId  = '';
  collaborators:[] = []

  private _mountRef!: ElementRef<HTMLDivElement>;

  private contentChangedSub?: Subscription;

  @ViewChild('editorLayout') editorLayoutRef?: ElementRef<HTMLElement>;
  @ViewChild('branchPanel') branchPanelRef?: BranchPanelComponent;

  @ViewChild('prosemirrorMount')
  set mountRef(el: ElementRef<HTMLDivElement>) {
    if (el && !this._mountRef) {
      this._mountRef = el;
      // Start the session the moment the element appears in the DOM.
      // The callback keeps the toolbar's highlighted button in sync with
      // wherever the cursor is — the element type is already visible
      // there, so there's no separate floating indicator to maintain too.
      const userId = this.clerk.userId$.value;
      const userName = this.clerk.user$.value?.name;
      this.sync.startSession(
        this.scriptId,
        el.nativeElement,
        null,
        (element) => { this.activeElement = element; },
        userId && userName ? { id: userId, name: userName } : undefined,
      );

      // Title page scroll-tracking (viewingTitlePage badge) — scrapped
      // for now along with the rest of the title page feature, see below.
      // this.pmMountEl = el.nativeElement.closest('.pm-mount');
      // this.pmMountEl?.addEventListener('scroll', this.onEditorScroll, { passive: true });
      // this.updateViewingTitlePage();
      // Flags the "unsaved changes" warning (beforeunload below, plus the
      // canDeactivate guard on this route) whenever the doc actually
      // changes — cleared again by AutoSaveService on its next successful
      // save. Gated on canEdit so a viewer's session (which only ever
      // mirrors remote changes) never trips it.
      this.contentChangedSub = this.sync.contentChanged$.subscribe(() => {
        if (this.canEdit) this.autoSave.markDirty();
      });
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

  // Title page feature — scrapped for now (the "Go to script page" nav
  // never actually left the title page in practice). Commented out
  // rather than deleted so it's a straightforward re-enable later; the
  // underlying schema/export support is untouched.
  //
  // viewingTitlePage = false;
  // private pmMountEl: HTMLElement | null = null;
  // private scrollRafId: number | null = null;
  //
  // private onEditorScroll = (): void => {
  //   if (this.scrollRafId !== null) return;
  //   this.scrollRafId = requestAnimationFrame(() => {
  //     this.scrollRafId = null;
  //     this.updateViewingTitlePage();
  //   });
  // };
  //
  // private updateViewingTitlePage(): void {
  //   const view = (this.sync as any).session?.view;
  //   const mount = this.pmMountEl;
  //   if (!view || !mount) { this.viewingTitlePage = false; return; }
  //
  //   const fields = view.dom.querySelectorAll('[data-element="title_page_field"]');
  //   if (fields.length === 0) { this.viewingTitlePage = false; return; }
  //
  //   const last = fields[fields.length - 1] as HTMLElement;
  //   const mountRect = mount.getBoundingClientRect();
  //   const lastRect = last.getBoundingClientRect();
  //   // Absolute scroll offset at which the title page block's bottom
  //   // edge reaches the top of the viewport — past that, we're reading
  //   // script content, not the title page.
  //   const boundary = lastRect.bottom - mountRect.top + mount.scrollTop;
  //   this.viewingTitlePage = mount.scrollTop < boundary;
  // }

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
  // that's real work (the full history list, the autosave pipe...).
  // Reassigning modHeld to a value it's already at still triggers that
  // whole sweep, and a held
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

  // Set from projectService.get()/scriptService.get()'s error paths — a
  // real 404, unlike getMyRole's 403 (which can't tell "doesn't exist"
  // apart from "exists but you're not a member"). Take priority over the
  // permission-denied state in the template for exactly that reason.
  projectNotFound = false;
  scriptNotFound = false;
  private projectSettled = false;
  private scriptSettled = false;

  // All three independent requests (project, script, role) need to
  // settle before the template can tell which state to show — waiting
  // on just roleLoaded let the page flash "access denied" for a fraction
  // of a second before a slower project/script 404 flipped it to "not
  // found" instead.
  get pageReady(): boolean {
    return this.projectSettled && this.scriptSettled && this.roleLoaded;
  }

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
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // ActivatedRoute.snapshot.params holds the :projectId and :scriptId
    // values from the current URL — captured by the router automatically
    this.projectId = this.route.snapshot.params['projectId'];
    this.scriptId  = this.route.snapshot.params['scriptId'];

    this.projectService.get(this.projectId).subscribe({
      next: p => { this.project = p; this.projectSettled = true; },
      error: () => { this.projectNotFound = true; this.projectSettled = true; },
    });

    this.scriptService.get(this.projectId, this.scriptId).subscribe({
      next: s => { this.script = s; this.scriptSettled = true; },
      error: () => { this.scriptNotFound = true; this.scriptSettled = true; },
    });

    // Fetch the current user's role on this project
    this.membership.getMyRole(this.projectId).subscribe({
      next: ({ role }) => {
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

  goHome(): void {
    this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.sync.endSession();
    this.autoSave.stop()
    this.contentChangedSub?.unsubscribe();
    // this.pmMountEl?.removeEventListener('scroll', this.onEditorScroll);
    // if (this.scrollRafId !== null) cancelAnimationFrame(this.scrollRafId);
  }

  // Warns on an actual tab close/refresh — in-app navigation (clicking
  // another link, the router "Open project…" etc.) is instead covered by
  // unsavedChangesGuard on this route, which calls hasUnsavedChanges()
  // below directly rather than going through the browser's native prompt.
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = ''; // Chrome requires the value to be set, not just preventDefault()
    }
  }

  hasUnsavedChanges(): boolean {
    return this.canEdit && this.autoSave.state$.getValue().dirty;
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
        this.commitMessage = '';
        this.autoSave.markSaved();
        // Without this, the new snapshot only showed up in the sidebar's
        // history list after a full page reload — BranchPanelComponent
        // fetched its `history` array once on init and had no way to
        // know a commit had just happened elsewhere.
        this.branchPanelRef?.addSnapshot(snap);
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
  //
  // Title page insert/navigate feature — scrapped for now. "Go to script
  // page" wasn't reliably leaving the title page in practice; commenting
  // out rather than deleting so it's a straightforward re-enable once
  // that's sorted out. The button/badge that called into this are
  // commented out in editor.component.html too. The underlying
  // title_page_field schema node and its export/import support are left
  // alone — existing documents may already contain one.
  //
  // get hasTitlePage(): boolean {
  //   const view = (this.sync as any).session?.view;
  //   const first = view?.state?.doc?.firstChild;
  //   return !!first && first.attrs['element'] === 'title_page_field';
  // }
  //
  // get titlePageButtonLabel(): string {
  //   if (!this.hasTitlePage) return 'Insert title page…';
  //   return this.viewingTitlePage ? 'Go to script page' : 'Go to title page';
  // }
  //
  // onTitlePageButtonClick(): void {
  //   const view = (this.sync as any).session?.view;
  //   if (!view) return;
  //
  //   if (!this.hasTitlePage) {
  //     const fieldType = screenplaySchema.nodes['title_page_field'];
  //     const nodes = TITLE_PAGE_KEYS.slice(0, 3).map(key =>  // Title, Credit, Author
  //       fieldType.create({ element: 'title_page_field', key })
  //     );
  //     view.dispatch(view.state.tr.insert(0, nodes));
  //     this.revealTitlePage(view);
  //     return;
  //   }
  //
  //   if (this.viewingTitlePage) {
  //     this.revealScriptContent(view);
  //   } else {
  //     this.revealTitlePage(view);
  //   }
  // }
  //
  // private revealTitlePage(view: any): void {
  //   view.dom.closest('.pm-mount')?.scrollTo({ top: 0, behavior: 'smooth' });
  //   const selection = TextSelection.atStart(view.state.doc);
  //   view.dispatch(view.state.tr.setSelection(selection));
  //   view.focus();
  // }
  //
  // private revealScriptContent(view: any): void {
  //   const pos = this.titlePageEndPos(view);
  //   const mount = view.dom.closest('.pm-mount') as HTMLElement | null;
  //   if (mount) {
  //     const coords = view.coordsAtPos(pos);
  //     const mountRect = mount.getBoundingClientRect();
  //     mount.scrollTo({ top: mount.scrollTop + (coords.top - mountRect.top) - 12, behavior: 'smooth' });
  //   }
  //   const selection = TextSelection.near(view.state.doc.resolve(pos));
  //   view.dispatch(view.state.tr.setSelection(selection));
  //   view.focus();
  // }
  //
  // private titlePageEndPos(view: any): number {
  //   const doc = view.state.doc;
  //   let pos = 0;
  //   for (let i = 0; i < doc.childCount; i++) {
  //     const node = doc.child(i);
  //     if (node.attrs?.['element'] !== 'title_page_field') break;
  //     pos += node.nodeSize;
  //   }
  //   return pos;
  // }

  private get exportFilename(): string {
    return scriptExportFilename(this.script?.title, this.scriptId);
  }

  // ── Project / Script menu (rename, open, new) ───────────────────────

  showRenameProjectModal = false;
  renameProjectTitle = '';
  renameProjectError = '';

  openRenameProjectModal(): void {
    if (!this.project) return;
    this.renameProjectTitle = this.project.title;
    this.renameProjectError = '';
    this.showRenameProjectModal = true;
  }

  confirmRenameProject(): void {
    const title = this.renameProjectTitle.trim();
    if (!title || !this.project) return;
    this.projectService.rename(this.projectId, title).subscribe({
      next: () => {
        this.project!.title = title;
        this.showRenameProjectModal = false;
      },
      error: () => {
        this.renameProjectError = 'Could not rename project.';
      },
    });
  }

  showRenameScriptModal = false;
  renameScriptTitle = '';
  renameScriptError = '';

  openRenameScriptModal(): void {
    if (!this.script) return;
    this.renameScriptTitle = this.script.title;
    this.renameScriptError = '';
    this.showRenameScriptModal = true;
  }

  confirmRenameScript(): void {
    const title = this.renameScriptTitle.trim();
    if (!title || !this.script) return;
    this.scriptService.rename(this.projectId, this.scriptId, title).subscribe({
      next: () => {
        this.script!.title = title;
        this.showRenameScriptModal = false;
      },
      error: () => {
        this.renameScriptError = 'Could not rename script.';
      },
    });
  }

  showNewProjectModal = false;
  newProjectTitle = '';
  newProjectError = '';

  openNewProjectModal(): void {
    this.newProjectTitle = '';
    this.newProjectError = '';
    this.showNewProjectModal = true;
  }

  confirmNewProject(): void {
    const title = this.newProjectTitle.trim();
    if (!title) return;
    this.projectService.create(title).subscribe({
      next: p => {
        this.showNewProjectModal = false;
        this.router.navigate(['/projects', p.id]);
      },
      error: () => {
        this.newProjectError = 'Could not create project.';
      },
    });
  }

  showOpenProjectModal = false;
  openProjectsList: Project[] = [];
  openProjectsLoading = false;

  openOpenProjectModal(): void {
    this.showOpenProjectModal = true;
    this.openProjectsLoading = true;
    this.projectService.list().subscribe({
      next: projects => {
        this.openProjectsList = projects ?? [];
        this.openProjectsLoading = false;
      },
      error: () => {
        this.openProjectsLoading = false;
      },
    });
  }

  goToProject(p: Project): void {
    this.showOpenProjectModal = false;
    this.router.navigate(['/projects', p.id]);
  }

  // New scripts are always created in the project currently open in the
  // editor — there's no project picker, per the ask ("scripts created in
  // the editor are automatically assigned to the project being worked in").
  showNewScriptModal = false;
  newScriptTitle = '';
  newScriptError = '';

  openNewScriptModal(): void {
    this.newScriptTitle = '';
    this.newScriptError = '';
    this.showNewScriptModal = true;
  }

  confirmNewScript(): void {
    const title = this.newScriptTitle.trim();
    if (!title) return;
    this.scriptService.create(this.projectId, title).subscribe({
      next: s => {
        this.showNewScriptModal = false;
        // A full navigation, not router.navigate — this route reuses the
        // same EditorComponent instance for a same-pattern URL change
        // (only :scriptId differs), which would leave the OLD script's
        // ProseMirror/Yjs session mounted instead of starting a fresh one
        // for the new script. See goToScript below for the same reasoning.
        window.location.href = `/projects/${this.projectId}/scripts/${s.id}`;
      },
      error: () => {
        this.newScriptError = 'Could not create script.';
      },
    });
  }

  showOpenScriptModal = false;
  openScriptsList: Script[] = [];
  openScriptsLoading = false;

  openOpenScriptModal(): void {
    this.showOpenScriptModal = true;
    this.openScriptsLoading = true;
    this.scriptService.list(this.projectId).subscribe({
      next: scripts => {
        this.openScriptsList = scripts ?? [];
        this.openScriptsLoading = false;
      },
      error: () => {
        this.openScriptsLoading = false;
      },
    });
  }

  goToScript(s: Script): void {
    this.showOpenScriptModal = false;
    // Full navigation rather than router.navigate — see confirmNewScript
    // above for why: this route reuses the same EditorComponent instance
    // for a same-pattern URL change, so the router alone wouldn't actually
    // load the new script's content.
    window.location.href = `/projects/${this.projectId}/scripts/${s.id}`;
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
    const file = await pickFile('.fountain,.txt');
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
    const file = await pickFile('.json');
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
    const file = await pickFile('.html,.htm');
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
    const file = await pickFile('.docx');
    if (!file) return;
    try {
      this.replaceEditorContent(await importDocxToText(file));
    } catch (err) {
      console.error('DOCX import failed:', err);
      alert('Could not import that Word document.');
    }
  }

  async importPdf(): Promise<void> {
    const file = await pickFile('.pdf');
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

  showRenameCharacter = false;
  renameCharacterNames: string[] = [];
  renameCharacterOld = '';
  renameCharacterNew = '';
  renameCharacterError = '';

  openRenameCharacter(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;

    this.renameCharacterNames = listCharacterNames(view.state.doc);
    // Pre-select whichever character (if any) the cursor is currently
    // inside — a nice default, not required, since the dropdown lists
    // every character either way.
    const el = view.state.selection.$from.parent.attrs['element'];
    const cursorText = (el === 'character' || el === 'dual_dialogue')
      ? view.state.selection.$from.parent.textContent.replace(/\(.*?\)/g, '').trim()
      : '';
    this.renameCharacterOld = this.renameCharacterNames.includes(cursorText)
      ? cursorText
      : (this.renameCharacterNames[0] ?? '');
    this.renameCharacterNew = '';
    this.renameCharacterError = '';
    this.showRenameCharacter = true;
  }

  confirmRenameCharacter(): void {
    const view = (this.sync as any).session?.view;
    const newName = this.renameCharacterNew.trim();
    if (!view || !this.renameCharacterOld || !newName) return;

    const count = renameCharacter(view, this.renameCharacterOld, newName);
    if (count === 0) {
      this.renameCharacterError = 'No lines found for that character.';
      return;
    }
    view.focus();
    this.showRenameCharacter = false;
  }

  // ── Format menu ──────────────────────────────────────────────────

  showLinkModal = false;
  linkUrl = '';

  openLinkModal(): void {
    this.linkUrl = '';
    this.showLinkModal = true;
  }

  confirmInsertLink(): void {
    const view = (this.sync as any).session?.view;
    const url = this.linkUrl.trim();
    if (!view || !url) return;
    applyLink(view, url);
    this.showLinkModal = false;
  }

  removeLinkAtCursor(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    removeLink(view);
  }

  async insertImagePrompt(): Promise<void> {
    const view = (this.sync as any).session?.view;
    if (!view) return;
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const dataUri = await fileToBackgroundDataUri(file);
      insertImage(view, dataUri, file.name);
      view.focus();
    } catch (err) {
      console.error('Image insert failed:', err);
      alert(err instanceof Error ? err.message : 'Could not insert that image.');
    }
  }

  // ── View menu ────────────────────────────────────────────────────

  toggleToolbar(): void {
    this.showToolbar = !this.showToolbar;
  }

  // "Page view" is the existing continuous manuscript editor; "Card
  // view" is a read-only overview (see card-view.ts) — #prosemirrorMount
  // stays mounted underneath either way (see the pm-mount [class.view-
  // hidden] binding in the template), just hidden, since it's the one
  // live collaborative session and re-mounting it would restart sync.
  viewMode: 'page' | 'card' = 'page';
  sceneCards: SceneCard[] = [];

  setViewMode(mode: 'page' | 'card'): void {
    this.viewMode = mode;
    if (mode === 'card') {
      const view = (this.sync as any).session?.view;
      if (view) this.sceneCards = computeSceneCards(view.state.doc);
    }
  }

  // Switches back to Page View and scrolls/positions the cursor at the
  // clicked scene, so "editing from card view" is one click away even
  // though the cards themselves aren't editable.
  jumpToScene(card: SceneCard): void {
    this.viewMode = 'page';
    const view = (this.sync as any).session?.view;
    if (!view) return;
    // The mount was just unhidden by the viewMode flip above — give
    // Angular a tick to apply it before scrollIntoView() measures layout.
    setTimeout(() => {
      const pos = Math.min(card.pos + 1, view.state.doc.content.size);
      const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos)));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    }, 0);
  }

  isFullscreen = false;

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    // Also fires when the user exits via Esc or browser chrome directly
    // (not just our own toggle button), so this is the source of truth
    // rather than flipping isFullscreen ourselves in toggleFullscreen().
    this.isFullscreen = !!document.fullscreenElement;
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.editorLayoutRef?.nativeElement.requestFullscreen();
    }
  }

  // ── Share menu ───────────────────────────────────────────────────

  goToCollaborators(): void {
    // Navigate back to the project page where collaborators live
    this.router.navigate(['/projects', this.projectId]);
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

  // Set right before opening the budget modal from a script selection —
  // see BudgetEstimatorComponent's pendingSelection input.
  pendingBudgetSelection: PendingBudgetSelection | null = null;

  addSelectionToBudget(): void {
    const view = (this.sync as any).session?.view;
    if (!view || !this.canEdit) return;

    const { from, to, empty } = view.state.selection;
    if (empty) {
      alert('Select some text in the script first, then add it to the budget.');
      return;
    }

    this.pendingBudgetSelection = { from, to, text: view.state.doc.textBetween(from, to, ' ') };
    this.showBudget = true;
  }

  closeBudget(): void {
    this.showBudget = false;
    this.pendingBudgetSelection = null;
  }

  // "Show in script" from the budget list — mirrors jumpToScene: switch
  // out of card view, find the live doc position, scroll the selection
  // there. The budget_item mark's own position is the only source of
  // truth for where it is now, unlike jumpToScene's stored card.pos —
  // an edit anywhere in the doc could have moved this run since the
  // item was linked, but never the mark's own presence.
  jumpToBudgetMark(markId: string): void {
    this.closeBudget();
    this.viewMode = 'page';
    const view = (this.sync as any).session?.view;
    if (!view) return;
    setTimeout(() => {
      const pos = findBudgetMarkPos(view, markId);
      if (pos === null) return; // marked text was deleted since — nothing to jump to
      const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos)));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    }, 0);
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
    { keys: '⌘Z',    label: 'Undo' },
    { keys: '⌘Y',    label: 'Redo' },
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
