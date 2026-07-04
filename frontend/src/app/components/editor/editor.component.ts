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
} from '../../editor/screenplay-schema';
import { setBlockType } from 'prosemirror-commands';

const ELEMENTS: ScreenplayElement[] = [
  'scene_heading', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'lyrics', 'dual_dialogue', 'sequence_heading', 'note',
];

import { toFountain, downloadFountain } from '../../editor/fountain-export';
import { MenuDropdownComponent } from '../menu-dropdown/menu-dropdown.component';
import { fountainToPMDoc, parseFountain } from '../../editor/fountain-import';
import { MembershipService } from '../../services/membership.service';

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
      // Start the session the moment the element appears in the DOM
      this.sync.startSession(
        this.scriptId,
        el.nativeElement,
      );
      // Apply read-only if role already loaded by this point
      if (this.myRole === 'viewer') this.makeEditorReadOnly();
    }
  }

  latestSnapContent = '';
  commitMessage = '';
  activeBranch: Branch | null = null;
  showDiff = false;
  diffFromId = '';
  diffToId   = '';

  elements = ELEMENTS;
  elementLabels = ELEMENT_LABELS;
  activeElement: ScreenplayElement | null = null;

  showIndicator = true;
  showToolbar = true;

  roles: string[] = ['owner', 'editor', 'viewer']
  myRole = '';
  roleLoaded = false;

  constructor(
    public sync: SyncService,
    public vc: VersionControlService,
    private membership: MembershipService,  // ← add this
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
  }

  onBranchSelected(branch: Branch): void {
    this.activeBranch = branch;
    this.applySnapshotContent()
    console.log(this.latestSnapContent)
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

  toggleIndicator(): void {
    this.showIndicator = !this.showIndicator;
  }

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
      '⌘1 — Scene heading\n' +
      '⌘2 — Action\n' +
      '⌘3 — Character\n' +
      '⌘4 — Dialogue\n' +
      '⌘5 — Parenthetical\n' +
      '⌘6 — Transition'
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

  applySnapshotContent(): void {
    // Implement auto save
    const session = (this.sync as any).session;
    if (!session) return;

    const view = session.view;
    const ydoc: Y.Doc = session.doc;

    // Parse Fountain into structured elements
    // const parsed = parseFountain(text);
    // const newDoc = fountainToPMDoc(parsed);

    // Instead of replacing ProseMirror state directly, we update
    // the Yjs document — ySyncPlugin will then sync the new content
    // into ProseMirror automatically.
    //
    // We do this by applying a ProseMirror transaction that replaces
    // the entire document content, wrapped in a Yjs transaction so
    // the change is tracked by the CRDT.
    ydoc.transact(() => {
      const { tr } = view.state;
      tr.replaceWith(0, view.state.doc.content.size, "hafa");
      view.dispatch(tr);
    });

    view.focus();
  }
  
  // Convenience getters used in the template to show/hide UI
  get isOwner(): boolean { return this.myRole === 'owner'; }
  get canEdit(): boolean { return this.myRole === 'owner' || this.myRole === 'editor'; }
}
