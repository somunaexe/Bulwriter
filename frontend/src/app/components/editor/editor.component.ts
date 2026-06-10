import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { VersionControlService, Branch, Snapshot } from '../../services/version-control.service';
import { BranchPanelComponent } from '../branch-panel/branch-panel.component';
import { DiffViewerComponent } from '../diff-viewer/diff-viewer.component';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, BranchPanelComponent, DiffViewerComponent],
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @Input() projectId = 'demo-project';
  @Input() scriptId  = 'demo-script';

  @ViewChild('prosemirrorMount') mountRef!: ElementRef<HTMLDivElement>;

  commitMessage = '';
  activeBranch: Branch | null = null;
  showDiff = false;
  diffFromId = '';
  diffToId   = '';

  constructor(
    public sync: SyncService,
    public vc: VersionControlService,
  ) {}

  ngAfterViewInit(): void {
    this.sync.startSession(this.scriptId, this.mountRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.sync.endSession();
  }

  onBranchSelected(branch: Branch): void {
    this.activeBranch = branch;
  }

  saveSnapshot(): void {
    if (!this.activeBranch || !this.commitMessage.trim()) return;
    const content = this.sync.getContent();
    this.vc
      .commit(this.projectId, this.activeBranch.id, content, this.commitMessage)
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
}
