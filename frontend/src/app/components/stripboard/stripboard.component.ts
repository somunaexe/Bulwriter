import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { SyncService } from '../../services/sync.service';
import { ScheduleService, StripInput } from '../../services/schedule.service';
import { computeSceneList, downloadCsv, SceneEntry } from '../../editor/scene-breakdown';
import { autoSuggestDays, scheduleToCsv, ScheduleDay } from '../../editor/stripboard';

@Component({
  selector: 'app-stripboard',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './stripboard.component.html',
  styleUrls: ['./stripboard.component.scss'],
})
export class StripboardComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  days: ScheduleDay[] = [];

  constructor(
    private sync: SyncService,
    private scheduleService: ScheduleService,
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
    const scenes: SceneEntry[] = doc ? computeSceneList(doc) : [];
    const sceneByKey = new Map(scenes.map(s => [s.sceneKey, s]));

    this.scheduleService.list(this.projectId, this.scriptId).subscribe({
      next: strips => {
        this.days = strips.length ? this.buildFromSaved(strips, scenes, sceneByKey) : autoSuggestDays(scenes);
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

    const days: ScheduleDay[] = [...dayMap.keys()]
      .sort((a, b) => a - b)
      .map((dayNumber, i) => ({ dayNumber: i + 1, strips: dayMap.get(dayNumber)! }));

    // Scenes written since the schedule was last saved have nowhere to
    // go yet — land them on a fresh day at the end rather than silently
    // dropping them from the board.
    const uncovered = scenes.filter(s => !covered.has(s.sceneKey));
    if (uncovered.length) days.push({ dayNumber: days.length + 1, strips: uncovered });

    return days.length ? days : [{ dayNumber: 1, strips: [] }];
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
    this.days.push({ dayNumber: this.days.length + 1, strips: [] });
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
    this.days.forEach(day => {
      day.strips.forEach((scene, i) => {
        strips.push({ sceneKey: scene.sceneKey, dayNumber: day.dayNumber, position: i });
      });
    });
    this.scheduleService.replace(this.projectId, this.scriptId, strips).subscribe();
  }

  exportCsv(): void {
    downloadCsv(scheduleToCsv(this.days), `${this.scriptId}-schedule`);
  }
}
