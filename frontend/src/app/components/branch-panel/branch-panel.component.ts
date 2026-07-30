import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { VersionControlService, Branch, Snapshot } from '../../services/version-control.service';
import { AutoSaveState, AutoSaveInterval } from '../../services/autosave.service';

// 0 stands in for "off" on the slider — AutoSaveInterval itself has no
// off value, since AutoSaveService only has an interval while it also
// tracks enabled/disabled separately.
type SliderValue = 0 | AutoSaveInterval;

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
  @Output() autoSaveIntervalChange = new EventEmitter<SliderValue>();

  // The slider's dot positions, left to right — index 0 is always
  // "off" (auto-save disabled), the rest are AutoSaveService's real
  // intervals in ascending order.
  readonly autoSaveIntervals: SliderValue[] = [0, 1, 2, 5, 10];

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

  // ── Auto-save slider ────────────────────────────────────────────

  sliderIndexFor(state: AutoSaveState): number {
    const value: SliderValue = state.enabled ? state.intervalMinutes : 0;
    const idx = this.autoSaveIntervals.indexOf(value);
    return idx === -1 ? 0 : idx;
  }

  // The filled (green) portion of the track runs from the left edge
  // up to the selected dot — a plain 0%-at-"off" gradient handles the
  // off case on its own, no special-casing needed.
  trackBackground(state: AutoSaveState): string {
    const percent = (this.sliderIndexFor(state) / (this.autoSaveIntervals.length - 1)) * 100;
    return `linear-gradient(to right, var(--insert-fg) 0%, var(--insert-fg) ${percent}%, var(--border) ${percent}%, var(--border) 100%)`;
  }

  // Dot 0 ("off") is red only while it's the selected one — everywhere
  // else it's swept into the green fill like any other passed dot, so
  // red reads as a distinct "auto-save is off" signal rather than just
  // the start of an empty progress bar.
  dotColor(i: number, state: AutoSaveState): string {
    const selected = this.sliderIndexFor(state);
    if (i === 0) return selected === 0 ? 'var(--delete-fg)' : 'var(--insert-fg)';
    return selected >= i ? 'var(--insert-fg)' : 'var(--border)';
  }

  onAutoSaveSlider(event: Event): void {
    const idx = Number((event.target as HTMLInputElement).value);
    this.autoSaveIntervalChange.emit(this.autoSaveIntervals[idx] ?? 0);
  }

  // Disables the Create button both for an empty name and for one that
  // already matches an existing branch (case-insensitive) — branch names
  // otherwise silently collide, since createBranch() has no server-side
  // uniqueness check of its own.
  get canCreateBranch(): boolean {
    const name = this.newBranchName.trim();
    if (!name) return false;
    return !this.branches.some(b => b.name.toLowerCase() === name.toLowerCase());
  }

  createBranch(): void {
    if (!this.canCreateBranch) return;
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
