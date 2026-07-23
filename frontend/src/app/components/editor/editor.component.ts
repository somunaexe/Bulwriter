import { OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import * as Y from 'yjs';
import {
  Component, OnDestroy,
  ViewChild, ElementRef, Input
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SyncService } from '../../services/sync.service';
import { VersionControlService, Branch } from '../../services/version-control.service';
import { BranchPanelComponent } from '../branch-panel/branch-panel.component';
import { DiffViewerComponent } from '../diff-viewer/diff-viewer.component';
import {
  screenplaySchema,
  ScreenplayElement,
  ELEMENT_LABELS,
  TITLE_PAGE_KEYS,
} from '../../editor/screenplay-schema';
import { setBlockType } from 'prosemirror-commands';

const ELEMENTS: ScreenplayElement[] = [
  'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'lyrics', 'dual_dialogue', 'sequence', 'note',
];

import { toFountain, downloadFountain } from '../../editor/fountain-export';
import { MenuDropdownComponent } from '../menu-dropdown/menu-dropdown.component';
import { fountainToPMDoc, parseFountain } from '../../editor/fountain-import';
import { MembershipService } from '../../services/membership.service';
import { AutoSaveService } from '../../services/autosave.service';
import { CurrentRoleService } from '../../services/current-role.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, BranchPanelComponent, DiffViewerComponent, MenuDropdownComponent],
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
})
export class EditorComponent implements OnInit, OnDestroy {
  projectId = '';
  scriptId  = '';
  collaborators:[] = []

  private _mountRef!: ElementRef<HTMLDivElement>;

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
      // Apply read-only if role already loaded by this point
      if (this.myRole === 'viewer') this.makeEditorReadOnly();
      if (this.myRole !== 'viewer') {
        // Give auto-save a function that saves the current content
        // to whichever branch is currently active
        this.autoSave.setSaveFn(async () => {
          if (!this.activeBranch) return;
            const content = this.sync.getContent();
            await this.vc.commit(
              this.projectId,
              this.scriptId,
              this.activeBranch.id,
              content,
              `Auto-save-${Math.floor(1000 + Math.random() * 9000)}`,
            );
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
  activeElement: ScreenplayElement | null = null;

  showToolbar = true;
  sidebarOpen = false; // off-canvas on mobile; CSS keeps the sidebar always visible on wider screens

  roles: string[] = ['owner', 'editor', 'viewer']
  myRole = '';
  roleLoaded = false;

  autoSaveState$ = this.autoSave.state$;

  constructor(
    public sync: SyncService,
    public vc: VersionControlService,
    private membership: MembershipService,
    private autoSave: AutoSaveService,  // ← add this
    private currentRole: CurrentRoleService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // ActivatedRoute.snapshot.params holds the :projectId and :scriptId
    // values from the current URL — captured by the router automatically
    this.projectId = this.route.snapshot.params['projectId'];
    this.scriptId  = this.route.snapshot.params['scriptId'];

    // Fetch the current user's role on this project
    this.membership.getMyRole(this.projectId).subscribe({
      next: ({ role }) => {
        console.log(role)
        this.myRole = role;
        this.roleLoaded = true;
        this.currentRole.setRole(role);
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
    this.currentRole.clear();
  }

  applySnapshotContent(branch: Branch): void {
    // Implement auto save
    this.vc.getSnapshot(this.projectId, this.scriptId, branch.id, branch.tipId).subscribe(snap => {
      if (!snap?.content) return;

      const session = (this.sync as any).session;
      if (!session) return;

      const view = session.view;
      const ydoc: Y.Doc = session.doc;

      // Parse Fountain into structured elements
      const parsed = parseFountain(snap.content);
      const newDoc = fountainToPMDoc(parsed);

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
    });
  }

  onBranchSelected(branch: Branch): void {
    this.sidebarOpen = false; // auto-close the off-canvas drafts panel on mobile
    const previousBranch = this.activeBranch;

    const switchTo = () => {
      this.activeBranch = branch;
      // If there's no tip snapshot, nothing to load
      if (!branch.tipId) return;
      this.applySnapshotContent(branch);
    };

    // Auto-save the work on the branch we're leaving — to that branch,
    // not the one we're switching to — before loading the new content.
    if (previousBranch && previousBranch.id !== branch.id && this.canEdit) {
      const content = this.sync.getContent();
      this.vc
        .commit(
          this.projectId,
          this.scriptId,
          previousBranch.id,
          content,
          `Auto-save before switching to "${branch.name}"`,
        )
        .subscribe({
          next: () => switchTo(),
          // Don't let a failed auto-save block the branch switch —
          // the user's local content is still in the editor either way.
          error: (err) => {
            console.error('Auto-save before branch switch failed:', err);
            switchTo();
          },
        });
    } else {
      switchTo();
    }
  }

  toggleAutoSave(): void {
    const current = this.autoSave.state$.getValue().enabled;
    this.autoSave.setEnabled(!current);
  }

  setAutoSaveInterval(minutes: 1 | 2 | 5 | 10): void {
    this.autoSave.setInterval(minutes);
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
      });
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

  exportFountain(): void {
    const view = (this.sync as any).session?.view;
    if (!view) return;

    const fountainText = toFountain(view.state.doc);
    downloadFountain(fountainText, this.scriptId);
  }

  exportPDF(): void {
      // Placeholder — bigger feature
  }

  importFountain(): void {
    // Create a hidden file input, click it, and read the result.
    // This is the standard browser pattern for file upload without a form.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.fountain,.txt';

    input.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) return;

        const session = (this.sync as any).session;
        if (!session) return;

        const view = session.view;
        const ydoc: Y.Doc = session.doc;

        // Parse Fountain into structured elements
        const parsed = parseFountain(text);
        const newDoc = fountainToPMDoc(parsed);

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

        view.focus();
      };

      reader.readAsText(file);
    };

    // Trigger the file picker
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
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

  openFindReplace(): void {
    // Placeholder for now
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

  openShortcuts(): void {
    alert(
      'Tab — cycle element type\n' +
      'Enter — new line (smart element)\n' +
      '⌘1 — Scene\n' +
      '⌘2 — Action\n' +
      '⌘3 — Character\n' +
      '⌘4 — Dialogue\n' +
      '⌘5 — Parenthetical\n' +
      '⌘6 — Transition\n' +
      '⌘7 — Shot\n' +
      '⌘8 — Lyrics\n' +
      '⌘9 — Dual Dialogue\n' +
      '⌘0 — Sequence\n' +
      '⌘- — Notes'
    );
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
