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
  @Output() branchSelected = new EventEmitter<Branch>();
  @Output() compareDrafts  = new EventEmitter<{ from: string; to: string }>();
  @Output() latestSnapContent = '';

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
    this.vc.listBranches(this.projectId, this.scriptId).subscribe(b => (this.branches = b));
  }

  selectBranch(branch: Branch): void {
    this.activeBranch = branch;
    this.branchSelected.emit(branch);
    this.vc.history(this.projectId, this.scriptId, branch.id).subscribe(h => (this.history = h));
    this.latestSnapContent = this.history.reduce((prev, curr) => new Date(curr.createdAt) > new Date(prev.createdAt) ? curr : prev).content;
  }

  createBranch(): void {
    if (!this.newBranchName.trim()) return;
    const fromId = this.activeBranch?.tipId ?? '';
    this.vc.createBranch(this.projectId, this.scriptId, this.newBranchName, fromId).subscribe(b => {
      this.branches.push(b);
      this.newBranchName = '';
      this.selectBranch(b);
    });
  }  compare(): void {
    if (this.selectedA && this.selectedB) {
      this.compareDrafts.emit({ from: this.selectedA, to: this.selectedB });
    }
  }
}
