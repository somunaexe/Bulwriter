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

// A tagged list field on BreakdownRow — props, costumes, or set
// dressing all get the same chip-editor UI, just pointed at a
// different property and a different draft input.
type TagField = 'props' | 'costumes' | 'setDressing';

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

  // The tag-input text currently being typed for a given row, keyed by
  // sceneKey — not part of BreakdownRow itself since that's shared with
  // the CSV export/summary aggregation logic.
  propDraft: Record<string, string> = {};
  costumeDraft: Record<string, string> = {};
  dressingDraft: Record<string, string> = {};

  locations: LocationSummary[] = [];
  cast: CastSummary[] = [];
  props: PropSummary[] = [];
  costumes: PropSummary[] = [];
  setDressing: PropSummary[] = [];

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
          costumes: byKey.get(scene.sceneKey)?.costumes ?? [],
          setDressing: byKey.get(scene.sceneKey)?.setDressing ?? [],
          notes: byKey.get(scene.sceneKey)?.notes ?? '',
        }));
        this.buildSummary();
        this.loading = false;
      },
      error: () => {
        // Still show the derived scene/cast list even if persisted tags
        // failed to load — it's read straight from the live document,
        // no network round-trip required for that part.
        this.rows = scenes.map(scene => ({ ...scene, props: [], costumes: [], setDressing: [], notes: '' }));
        this.buildSummary();
        this.loading = false;
      },
    });
  }

  private buildSummary(): void {
    const locCounts = new Map<string, number>();
    const castCounts = new Map<string, number>();
    const propCounts = new Map<string, number>();
    const costumeCounts = new Map<string, number>();
    const dressingCounts = new Map<string, number>();

    for (const row of this.rows) {
      locCounts.set(row.heading, (locCounts.get(row.heading) ?? 0) + 1);
      for (const name of row.cast) castCounts.set(name, (castCounts.get(name) ?? 0) + 1);
      for (const prop of row.props) propCounts.set(prop, (propCounts.get(prop) ?? 0) + 1);
      for (const item of row.costumes) costumeCounts.set(item, (costumeCounts.get(item) ?? 0) + 1);
      for (const item of row.setDressing) dressingCounts.set(item, (dressingCounts.get(item) ?? 0) + 1);
    }

    this.locations = [...locCounts.entries()].map(([name, sceneCount]) => ({ name, sceneCount }));
    this.cast = [...castCounts.entries()]
      .map(([name, sceneCount]) => ({ name, sceneCount }))
      .sort((a, b) => b.sceneCount - a.sceneCount);
    this.props = [...propCounts.entries()]
      .map(([name, sceneCount]) => ({ name, sceneCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.costumes = [...costumeCounts.entries()]
      .map(([name, sceneCount]) => ({ name, sceneCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.setDressing = [...dressingCounts.entries()]
      .map(([name, sceneCount]) => ({ name, sceneCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private saveRow(row: BreakdownRow): void {
    if (!this.canEdit) return;
    this.breakdown.upsert(this.projectId, this.scriptId, row.sceneKey, row.props, row.costumes, row.setDressing, row.notes).subscribe();
  }

  private draftFor(field: TagField): Record<string, string> {
    return field === 'props' ? this.propDraft : field === 'costumes' ? this.costumeDraft : this.dressingDraft;
  }

  addTag(row: BreakdownRow, field: TagField): void {
    const draft = this.draftFor(field);
    const value = (draft[row.sceneKey] || '').trim();
    if (!value || row[field].includes(value)) return;
    row[field].push(value);
    draft[row.sceneKey] = '';
    this.buildSummary();
    this.saveRow(row);
  }

  removeTag(row: BreakdownRow, field: TagField, value: string): void {
    if (!this.canEdit) return;
    row[field] = row[field].filter(v => v !== value);
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
