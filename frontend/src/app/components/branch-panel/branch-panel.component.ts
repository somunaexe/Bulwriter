import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { VersionControlService, Branch, Snapshot } from '../../services/version-control.service';
import { AutoSaveState } from '../../services/autosave.service';

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
  @Input() autoSaveState$: Observable<AutoSaveState> | null = null;

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

  // Terser the older a snapshot gets: today shows just the time, this
  // week shows "N days ago", this year shows month/day, and beyond that
  // the year comes back — e.g. "17:00", "6 days ago 17:00",
  // "05/08 17:00", "05/08/2026 17:00".
  formatSnapshotDate(createdAt: string): string {
    const created = new Date(createdAt);
    const now = new Date();

    const time = created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfDay(now) - startOfDay(created)) / 86400000);

    if (diffDays <= 0) return time;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago ${time}`;

    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const mm = String(created.getMonth() + 1).padStart(2, '0');
    const dd = String(created.getDate()).padStart(2, '0');

    return created < oneYearAgo
      ? `${mm}/${dd}/${created.getFullYear()} ${time}`
      : `${mm}/${dd} ${time}`;
  }
}
