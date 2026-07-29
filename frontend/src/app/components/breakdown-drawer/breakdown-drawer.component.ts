import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { SceneBreakdownService } from '../../services/scene-breakdown.service';
import { computeSceneList, breakdownToCsv, downloadCsv, BreakdownRow } from '../../editor/scene-breakdown';
import { scriptExportFilename } from '../../editor/export-filename';

interface LocationSummary { name: string; sceneCount: number; }
interface CastSummary { name: string; sceneCount: number; }
interface PropSummary { name: string; sceneCount: number; }

@Component({
  selector: 'app-breakdown-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './breakdown-drawer.component.html',
  styleUrls: ['./breakdown-drawer.component.scss'],
})
export class BreakdownDrawerComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() scriptTitle = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  view: 'scenes' | 'summary' = 'scenes';
  rows: BreakdownRow[] = [];

  // The prop-input text currently being typed for a given row, keyed by
  // sceneKey — not part of BreakdownRow itself since that's shared with
  // the CSV export/summary aggregation logic.
  propDraft: Record<string, string> = {};

  locations: LocationSummary[] = [];
  cast: CastSummary[] = [];
  props: PropSummary[] = [];

  constructor(
    private sync: SyncService,
    private breakdown: SceneBreakdownService,
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

    this.breakdown.list(this.projectId, this.scriptId).subscribe({
      next: tags => {
        const byKey = new Map(tags.map(t => [t.sceneKey, t]));
        this.rows = scenes.map(scene => ({
          ...scene,
          props: byKey.get(scene.sceneKey)?.props ?? [],
          notes: byKey.get(scene.sceneKey)?.notes ?? '',
        }));
        this.buildSummary();
        this.loading = false;
      },
      error: () => {
        // Still show the derived scene/cast list even if persisted tags
        // failed to load — it's read straight from the live document,
        // no network round-trip required for that part.
        this.rows = scenes.map(scene => ({ ...scene, props: [], notes: '' }));
        this.buildSummary();
        this.loading = false;
      },
    });
  }

  private buildSummary(): void {
    const locCounts = new Map<string, number>();
    const castCounts = new Map<string, number>();
    const propCounts = new Map<string, number>();

    for (const row of this.rows) {
      locCounts.set(row.heading, (locCounts.get(row.heading) ?? 0) + 1);
      for (const name of row.cast) castCounts.set(name, (castCounts.get(name) ?? 0) + 1);
      for (const prop of row.props) propCounts.set(prop, (propCounts.get(prop) ?? 0) + 1);
    }

    this.locations = [...locCounts.entries()].map(([name, sceneCount]) => ({ name, sceneCount }));
    this.cast = [...castCounts.entries()]
      .map(([name, sceneCount]) => ({ name, sceneCount }))
      .sort((a, b) => b.sceneCount - a.sceneCount);
    this.props = [...propCounts.entries()]
      .map(([name, sceneCount]) => ({ name, sceneCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private saveRow(row: BreakdownRow): void {
    if (!this.canEdit) return;
    this.breakdown.upsert(this.projectId, this.scriptId, row.sceneKey, row.props, row.notes).subscribe();
  }

  addProp(row: BreakdownRow): void {
    const value = (this.propDraft[row.sceneKey] || '').trim();
    if (!value || row.props.includes(value)) return;
    row.props.push(value);
    this.propDraft[row.sceneKey] = '';
    this.buildSummary();
    this.saveRow(row);
  }

  removeProp(row: BreakdownRow, prop: string): void {
    if (!this.canEdit) return;
    row.props = row.props.filter(p => p !== prop);
    this.buildSummary();
    this.saveRow(row);
  }

  onNotesBlur(row: BreakdownRow): void {
    this.saveRow(row);
  }

  exportCsv(): void {
    const csv = breakdownToCsv(this.rows);
    downloadCsv(csv, scriptExportFilename(this.scriptTitle, this.scriptId, 'breakdown'));
  }
}
