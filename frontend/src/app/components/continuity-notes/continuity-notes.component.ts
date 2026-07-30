import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { ContinuityService, ContinuityNote } from '../../services/continuity.service';
import { computeSceneList } from '../../editor/scene-breakdown';

interface SceneGroup {
  sceneKey: string;
  heading: string;
  notes: ContinuityNote[];
  showAdd: boolean;
  newTake: string;
  newNote: string;
  newFlagged: boolean;
}

function emptyGroup(sceneKey: string, heading: string, notes: ContinuityNote[]): SceneGroup {
  return { sceneKey, heading, notes, showAdd: false, newTake: '', newNote: '', newFlagged: false };
}

@Component({
  selector: 'app-continuity-notes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './continuity-notes.component.html',
  styleUrls: ['./continuity-notes.component.scss'],
})
export class ContinuityNotesComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  groups: SceneGroup[] = [];

  constructor(
    private sync: SyncService,
    private continuityService: ContinuityService,
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

    this.continuityService.list(this.projectId, this.scriptId).subscribe({
      next: notes => {
        const byKey = new Map<string, ContinuityNote[]>();
        for (const n of notes) {
          if (!byKey.has(n.sceneKey)) byKey.set(n.sceneKey, []);
          byKey.get(n.sceneKey)!.push(n);
        }

        this.groups = scenes.map(scene => emptyGroup(scene.sceneKey, scene.heading, byKey.get(scene.sceneKey) ?? []));

        // A scene already carrying notes but no longer in the live
        // script (heading changed/removed) still shows — same
        // reasoning as breakdown/casting/shots/music-vfx.
        const sceneKeys = new Set(scenes.map(s => s.sceneKey));
        for (const key of byKey.keys()) {
          if (!sceneKeys.has(key)) this.groups.push(emptyGroup(key, key, byKey.get(key)!));
        }

        this.loading = false;
      },
      error: () => {
        this.groups = scenes.map(scene => emptyGroup(scene.sceneKey, scene.heading, []));
        this.loading = false;
      },
    });
  }

  toggleAdd(group: SceneGroup): void {
    if (!this.canEdit) return;
    group.showAdd = !group.showAdd;
  }

  save(note: ContinuityNote): void {
    if (!this.canEdit) return;
    this.continuityService.update(this.projectId, this.scriptId, note.id, note.take, note.note, note.flagged).subscribe();
  }

  remove(group: SceneGroup, note: ContinuityNote): void {
    if (!this.canEdit) return;
    group.notes = group.notes.filter(n => n.id !== note.id);
    this.continuityService.remove(this.projectId, this.scriptId, note.id).subscribe();
  }

  addNote(group: SceneGroup): void {
    const note = group.newNote.trim();
    if (!note) return;

    this.continuityService.add(this.projectId, this.scriptId, group.sceneKey, group.newTake.trim(), note, group.newFlagged).subscribe(n => {
      group.notes.push(n);
      group.newTake = '';
      group.newNote = '';
      group.newFlagged = false;
    });
  }
}
