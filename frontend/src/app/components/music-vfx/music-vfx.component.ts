import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { MusicVfxService, SceneNote, SceneNoteKind, SceneNoteStatus } from '../../services/music-vfx.service';
import { computeSceneList } from '../../editor/scene-breakdown';

const STATUSES: SceneNoteStatus[] = ['suggested', 'confirmed', 'done'];

// One of the two lightweight lists (music or VFX) within a scene —
// same shape either way, just filtered by kind.
interface KindState {
  notes: SceneNote[];
  showAdd: boolean;
  newDescription: string;
  newStatus: SceneNoteStatus;
  newNotes: string;
}

function emptyKindState(notes: SceneNote[]): KindState {
  return { notes, showAdd: false, newDescription: '', newStatus: 'suggested', newNotes: '' };
}

interface SceneGroup {
  sceneKey: string;
  heading: string;
  music: KindState;
  vfx: KindState;
}

function emptyGroup(sceneKey: string, heading: string, musicNotes: SceneNote[], vfxNotes: SceneNote[]): SceneGroup {
  return { sceneKey, heading, music: emptyKindState(musicNotes), vfx: emptyKindState(vfxNotes) };
}

@Component({
  selector: 'app-music-vfx',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './music-vfx.component.html',
  styleUrls: ['./music-vfx.component.scss'],
})
export class MusicVfxComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  groups: SceneGroup[] = [];
  statuses = STATUSES;
  kinds: SceneNoteKind[] = ['music', 'vfx'];

  constructor(
    private sync: SyncService,
    private musicVfxService: MusicVfxService,
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

    this.musicVfxService.list(this.projectId, this.scriptId).subscribe({
      next: notes => {
        const musicByKey = new Map<string, SceneNote[]>();
        const vfxByKey = new Map<string, SceneNote[]>();
        for (const n of notes) {
          const map = n.kind === 'music' ? musicByKey : vfxByKey;
          if (!map.has(n.sceneKey)) map.set(n.sceneKey, []);
          map.get(n.sceneKey)!.push(n);
        }

        this.groups = scenes.map(scene => emptyGroup(
          scene.sceneKey, scene.heading, musicByKey.get(scene.sceneKey) ?? [], vfxByKey.get(scene.sceneKey) ?? [],
        ));

        // A scene already tagged with notes but no longer in the live
        // script (heading changed/removed) still shows — same reasoning
        // as breakdown/casting/shots: no reason to hide work already done.
        const sceneKeys = new Set(scenes.map(s => s.sceneKey));
        const otherKeys = new Set([...musicByKey.keys(), ...vfxByKey.keys()].filter(k => !sceneKeys.has(k)));
        for (const key of otherKeys) {
          this.groups.push(emptyGroup(key, key, musicByKey.get(key) ?? [], vfxByKey.get(key) ?? []));
        }

        this.loading = false;
      },
      error: () => {
        this.groups = scenes.map(scene => emptyGroup(scene.sceneKey, scene.heading, [], []));
        this.loading = false;
      },
    });
  }

  private kindState(group: SceneGroup, kind: SceneNoteKind): KindState {
    return kind === 'music' ? group.music : group.vfx;
  }

  toggleAdd(group: SceneGroup, kind: SceneNoteKind): void {
    if (!this.canEdit) return;
    const state = this.kindState(group, kind);
    state.showAdd = !state.showAdd;
  }

  save(note: SceneNote): void {
    if (!this.canEdit) return;
    this.musicVfxService.update(this.projectId, this.scriptId, note.id, note.description, note.status, note.notes).subscribe();
  }

  remove(group: SceneGroup, kind: SceneNoteKind, note: SceneNote): void {
    if (!this.canEdit) return;
    const state = this.kindState(group, kind);
    state.notes = state.notes.filter(n => n.id !== note.id);
    this.musicVfxService.remove(this.projectId, this.scriptId, note.id).subscribe();
  }

  addNote(group: SceneGroup, kind: SceneNoteKind): void {
    const state = this.kindState(group, kind);
    const description = state.newDescription.trim();
    if (!description) return;

    this.musicVfxService.add(
      this.projectId, this.scriptId, group.sceneKey, kind, description, state.newStatus, state.newNotes.trim(),
    ).subscribe(note => {
      state.notes.push(note);
      state.newDescription = '';
      state.newStatus = 'suggested';
      state.newNotes = '';
    });
  }
}
