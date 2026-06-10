import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VersionControlService, DiffLine } from '../../services/version-control.service';

@Component({
  selector: 'app-diff-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './diff-viewer.component.html',
  styleUrls: ['./diff-viewer.component.scss'],
})
export class DiffViewerComponent implements OnChanges {
  @Input() fromId = '';
  @Input() toId   = '';
  @Output() close = new EventEmitter<void>();

  lines: DiffLine[] = [];
  loading = false;

  constructor(private vc: VersionControlService) {}

  ngOnChanges(): void {
    if (this.fromId && this.toId) {
      this.loading = true;
      this.vc.diff(this.fromId, this.toId).subscribe({
        next: lines => { this.lines = lines; this.loading = false; },
        error: ()   => { this.loading = false; },
      });
    }
  }
}
