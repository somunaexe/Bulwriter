import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { SyncService } from '../../services/sync.service';
import { ScheduleService, StripInput, DayMetaInput, ScheduleDayMeta } from '../../services/schedule.service';
import { ProjectService } from '../../services/project.service';
import { ModalComponent } from '../modal/modal.component';
import { computeSceneList, downloadCsv, SceneEntry } from '../../editor/scene-breakdown';
import { autoSuggestDays, scheduleToCsv, emptyDayMeta, ScheduleDay } from '../../editor/stripboard';
import { exportCallSheetPdf } from '../../editor/call-sheet-pdf';
import { scriptExportFilename } from '../../editor/export-filename';

@Component({
  selector: 'app-stripboard',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, ModalComponent],
  templateUrl: './stripboard.component.html',
  styleUrls: ['./stripboard.component.scss'],
})
export class StripboardComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() scriptTitle = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  days: ScheduleDay[] = [];
  projectTitle = '';

  callSheetDay: ScheduleDay | null = null;

  constructor(
    private sync: SyncService,
    private scheduleService: ScheduleService,
    private projectService: ProjectService,
  ) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.callSheetDay) this.callSheetDay = null;
    else this.close.emit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scriptId'] || changes['projectId']) this.load();
  }

  private load(): void {
    if (!this.projectId || !this.scriptId) return;
    this.loading = true;

    this.projectService.get(this.projectId).subscribe(p => this.projectTitle = p.title);

    const doc = this.sync.getDoc();
    const scenes: SceneEntry[] = doc ? computeSceneList(doc) : [];
    const sceneByKey = new Map(scenes.map(s => [s.sceneKey, s]));

    this.scheduleService.list(this.projectId, this.scriptId).subscribe({
      next: ({ strips, days }) => {
        this.days = strips.length ? this.buildFromSaved(strips, days, scenes, sceneByKey) : autoSuggestDays(scenes);
        this.loading = false;
      },
      error: () => {
        this.days = autoSuggestDays(scenes);
        this.loading = false;
      },
    });
  }

  private buildFromSaved(
    strips: { sceneKey: string; dayNumber: number; position: number }[],
    dayMetas: ScheduleDayMeta[],
    scenes: SceneEntry[],
    sceneByKey: Map<string, SceneEntry>,
  ): ScheduleDay[] {
    const dayMap = new Map<number, SceneEntry[]>();
    const covered = new Set<string>();

    for (const strip of [...strips].sort((a, b) => a.position - b.position)) {
      const scene = sceneByKey.get(strip.sceneKey);
      if (!scene) continue; // scene heading changed/removed since the schedule was last saved
      covered.add(strip.sceneKey);
      if (!dayMap.has(strip.dayNumber)) dayMap.set(strip.dayNumber, []);
      dayMap.get(strip.dayNumber)!.push(scene);
    }

    const metaByDayNumber = new Map(dayMetas.map(d => [d.dayNumber, d]));

    const days: ScheduleDay[] = [...dayMap.keys()]
      .sort((a, b) => a - b)
      .map((dayNumber, i) => {
        const meta = metaByDayNumber.get(dayNumber);
        return {
          dayNumber: i + 1,
          strips: dayMap.get(dayNumber)!,
          shootDate: meta?.shootDate ?? '',
          callTime: meta?.callTime ?? '',
          location: meta?.location ?? '',
          notes: meta?.notes ?? '',
        };
      });

    // Scenes written since the schedule was last saved have nowhere to
    // go yet — land them on a fresh day at the end rather than silently
    // dropping them from the board.
    const uncovered = scenes.filter(s => !covered.has(s.sceneKey));
    if (uncovered.length) days.push({ dayNumber: days.length + 1, strips: uncovered, ...emptyDayMeta() });

    return days.length ? days : [{ dayNumber: 1, strips: [], ...emptyDayMeta() }];
  }

  onDrop(event: CdkDragDrop<SceneEntry[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    }
    this.persist();
  }

  addDay(): void {
    this.days.push({ dayNumber: this.days.length + 1, strips: [], ...emptyDayMeta() });
  }

  removeDay(day: ScheduleDay): void {
    if (day.strips.length) return;
    this.days = this.days.filter(d => d !== day);
    this.renumber();
    this.persist();
  }

  private renumber(): void {
    this.days.forEach((d, i) => d.dayNumber = i + 1);
  }

  private persist(): void {
    if (!this.canEdit) return;
    this.renumber();

    const strips: StripInput[] = [];
    const days: DayMetaInput[] = [];
    this.days.forEach(day => {
      day.strips.forEach((scene, i) => {
        strips.push({ sceneKey: scene.sceneKey, dayNumber: day.dayNumber, position: i });
      });
      days.push({
        dayNumber: day.dayNumber,
        shootDate: day.shootDate,
        callTime: day.callTime,
        location: day.location,
        notes: day.notes,
      });
    });
    this.scheduleService.replace(this.projectId, this.scriptId, strips, days).subscribe();
  }

  exportCsv(): void {
    downloadCsv(scheduleToCsv(this.days), scriptExportFilename(this.scriptTitle, this.scriptId, 'shoot schedule'));
  }

  // ── Call sheet ───────────────────────────────────────────────────

  openCallSheet(day: ScheduleDay): void {
    this.callSheetDay = day;
  }

  closeCallSheet(): void {
    this.callSheetDay = null;
    this.persist();
  }

  exportCallSheet(): void {
    if (!this.callSheetDay) return;
    exportCallSheetPdf(this.callSheetDay, {
      projectTitle: this.projectTitle || 'Untitled project',
      totalDays: this.days.length,
      filename: scriptExportFilename(this.scriptTitle, this.scriptId, 'shoot schedule'),
    }).catch(err => console.error('Call sheet export failed:', err));
  }
}
