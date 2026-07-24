import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VersionControlService, Branch, Snapshot } from '../../services/version-control.service';

@Component({
  selector: 'app-branch-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branch-panel.component.html',
  styleUrls: ['./branch-panel.component.scss'],
})
export class BranchPanelComponent implements OnInit {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;

  // The commit message text lives here (the sidebar), but committing
  // reads the live document content from SyncService, which only the
  // editor has — so message state round-trips to the parent while the
  // actual save stays owned by EditorComponent.
  @Input() commitMessage = '';
  @Output() commitMessageChange = new EventEmitter<string>();
  @Output() saveSnapshot = new EventEmitter<void>();

  @Output() branchSelected = new EventEmitter<Branch>();
  @Output() compareDrafts  = new EventEmitter<{ from: string; to: string }>();

  branches: Branch[]     = [];
  history: Snapshot[]    = [];
  activeBranch: Branch | null = null;
  newBranchName = '';
  selectedA: string = '';
  selectedB: string = '';

  constructor(private vc: VersionControlService) {}

  ngOnInit(): void {
    this.loadBranches();
  }

  loadBranches(): void {
    this.vc.listBranches(this.projectId, this.scriptId).subscribe(b => {
      this.branches = b ?? [];
      if (!this.branches.length) return;

      // Nothing was ever auto-selected here before — a fresh component
      // instance (e.g. on every full page reload) started with
      // activeBranch: null and just sat there empty until the user
      // manually clicked a branch. Restore whichever branch they were
      // last on for this script, falling back to the first branch (the
      // one the script was created with) if nothing's remembered yet.
      const lastId = localStorage.getItem(this.storageKey());
      const restored = this.branches.find(br => br.id === lastId);
      this.selectBranch(restored ?? this.branches[0]);
    });
  }

  selectBranch(branch: Branch): void {
    this.activeBranch = branch;
    this.branchSelected.emit(branch);
    this.vc.history(this.projectId, this.scriptId, branch.id).subscribe(h => (this.history = h ?? []));
    localStorage.setItem(this.storageKey(), branch.id);
  }

  private storageKey(): string {
    return `bulwriter:lastBranch:${this.scriptId}`;
  }

  createBranch(): void {
    if (!this.newBranchName.trim()) return;
    const fromId = this.activeBranch?.tipId ?? '';
    this.vc.createBranch(this.projectId, this.scriptId, this.newBranchName, fromId).subscribe(b => {
      this.branches.push(b);
      this.newBranchName = '';
      this.selectBranch(b);
    });
  }

  // A snapshot can't be compared to itself — picking it on one side
  // clears it from the other if it's already selected there.
  selectA(id: string): void {
    this.selectedA = id;
    if (this.selectedB === id) this.selectedB = '';
  }

  selectB(id: string): void {
    this.selectedB = id;
    if (this.selectedA === id) this.selectedA = '';
  }

  compare(): void {
    if (this.selectedA && this.selectedB && this.selectedA !== this.selectedB) {
      this.compareDrafts.emit({ from: this.selectedA, to: this.selectedB });
    }
  }
}
