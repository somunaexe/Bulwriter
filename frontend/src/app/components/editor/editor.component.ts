import { OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  Component, OnDestroy, AfterViewInit,
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
} from '../../editTools/screenplay-schema';
import { setBlockType } from 'prosemirror-commands';

const ELEMENTS: ScreenplayElement[] = [
  'scene_heading', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'lyrics', 'dual_dialogue', 'sequence_heading', 'note',
];

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, BranchPanelComponent, DiffViewerComponent],
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
})
export class EditorComponent implements OnInit, AfterViewInit, OnDestroy {
  projectId = '';
  scriptId  = '';
  collaborators:[] = []

  @ViewChild('prosemirrorMount') mountRef!: ElementRef<HTMLDivElement>;
  // @ViewChild('elementIndicator') indicatorRef!: ElementRef<HTMLDivElement>;

  commitMessage = '';
  activeBranch: Branch | null = null;
  showDiff = false;
  diffFromId = '';
  diffToId   = '';

  elements = ELEMENTS;
  elementLabels = ELEMENT_LABELS;
  activeElement: ScreenplayElement | null = null;

  constructor(
    public sync: SyncService,
    public vc: VersionControlService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // ActivatedRoute.snapshot.params holds the :projectId and :scriptId
    // values from the current URL — captured by the router automatically
    this.projectId = this.route.snapshot.params['projectId'];
    this.scriptId  = this.route.snapshot.params['scriptId'];
  }

  ngAfterViewInit(): void {
    this.sync.startSession(
      this.scriptId,
      this.mountRef.nativeElement,
      // this.indicatorRef.nativeElement,
    );
  }

  ngOnDestroy(): void {
    this.sync.endSession();
  }

  onBranchSelected(branch: Branch): void {
    this.activeBranch = branch;
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