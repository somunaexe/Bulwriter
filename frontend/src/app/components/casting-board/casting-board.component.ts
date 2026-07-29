import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { CastingService, CastingStatus } from '../../services/casting.service';
import { computeSceneList, csvCell, downloadCsv } from '../../editor/scene-breakdown';
import { scriptExportFilename } from '../../editor/export-filename';

// One row per character derived live from the script (same source as
// the breakdown's cast summary) — actorName/contact/status/notes are the
// only parts actually persisted (see CastingService).
interface CastingRow {
  characterName: string;
  sceneCount: number;
  actorName: string;
  contact: string;
  status: CastingStatus;
  notes: string;
}

const STATUSES: CastingStatus[] = ['open', 'submitted', 'callback', 'cast'];

@Component({
  selector: 'app-casting-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './casting-board.component.html',
  styleUrls: ['./casting-board.component.scss'],
})
export class CastingBoardComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() scriptTitle = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  rows: CastingRow[] = [];
  statuses = STATUSES;

  constructor(
    private sync: SyncService,
    private castingService: CastingService,
  ) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scriptId'] || changes['projectId']) this.load();
  }

  private load(): void {
    if (!this.projectId || !this.scriptId) return;
    this.loading = true;

    const doc = this.sync.getDoc();
    const scenes = doc ? computeSceneList(doc) : [];

    const sceneCounts = new Map<string, number>();
    for (const scene of scenes) {
      for (const name of scene.cast) {
        sceneCounts.set(name, (sceneCounts.get(name) ?? 0) + 1);
      }
    }
    const sortedNames = [...sceneCounts.entries()].sort((a, b) => b[1] - a[1]);

    this.castingService.list(this.projectId, this.scriptId).subscribe({
      next: roles => {
        const byName = new Map(roles.map(r => [r.characterName, r]));
        this.rows = sortedNames.map(([name, sceneCount]) => {
          const existing = byName.get(name);
          return {
            characterName: name,
            sceneCount,
            actorName: existing?.actorName ?? '',
            contact: existing?.contact ?? '',
            status: existing?.status ?? 'open',
            notes: existing?.notes ?? '',
          };
        });
        this.loading = false;
      },
      error: () => {
        this.rows = sortedNames.map(([name, sceneCount]) => ({
          characterName: name, sceneCount, actorName: '', contact: '', status: 'open' as CastingStatus, notes: '',
        }));
        this.loading = false;
      },
    });
  }

  save(row: CastingRow): void {
    if (!this.canEdit) return;
    this.castingService.upsert(
      this.projectId, this.scriptId,
      row.characterName, row.actorName, row.contact, row.status, row.notes,
    ).subscribe();
  }

  exportCsv(): void {
    const header = ['Character', 'Scenes', 'Actor', 'Contact', 'Status', 'Notes'];
    const lines = [header.map(csvCell).join(',')];
    for (const row of this.rows) {
      lines.push([
        row.characterName, String(row.sceneCount), row.actorName, row.contact, row.status, row.notes,
      ].map(csvCell).join(','));
    }
    downloadCsv(lines.join('\r\n'), scriptExportFilename(this.scriptTitle, this.scriptId, 'casting'));
  }
}
