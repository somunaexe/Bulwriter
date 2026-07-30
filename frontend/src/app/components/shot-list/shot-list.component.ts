import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { ShotListService, Shot } from '../../services/shot-list.service';
import { computeSceneList } from '../../editor/scene-breakdown';
import { fileToBackgroundDataUri } from '../../editor/background-image';

interface SceneGroup {
  sceneKey: string;
  heading: string;
  shots: Shot[];
  newShotType: string;
  newDescription: string;
  newImage: string;
}

@Component({
  selector: 'app-shot-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shot-list.component.html',
  styleUrls: ['./shot-list.component.scss'],
})
export class ShotListComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  groups: SceneGroup[] = [];

  constructor(
    private sync: SyncService,
    private shotListService: ShotListService,
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

    this.shotListService.list(this.projectId, this.scriptId).subscribe({
      next: shots => {
        const byKey = new Map<string, Shot[]>();
        for (const sh of shots) {
          if (!byKey.has(sh.sceneKey)) byKey.set(sh.sceneKey, []);
          byKey.get(sh.sceneKey)!.push(sh);
        }

        this.groups = scenes.map(scene => ({
          sceneKey: scene.sceneKey,
          heading: scene.heading,
          shots: byKey.get(scene.sceneKey) ?? [],
          newShotType: '',
          newDescription: '',
          newImage: '',
        }));

        // A scene already tagged with shots but no longer in the live
        // script (heading changed/removed) still shows — same reasoning
        // as breakdown/casting: no reason to hide prep work already done.
        const sceneKeys = new Set(scenes.map(s => s.sceneKey));
        for (const [key, list] of byKey) {
          if (!sceneKeys.has(key)) {
            this.groups.push({ sceneKey: key, heading: key, shots: list, newShotType: '', newDescription: '', newImage: '' });
          }
        }

        this.loading = false;
      },
      error: () => {
        this.groups = scenes.map(scene => ({
          sceneKey: scene.sceneKey, heading: scene.heading, shots: [], newShotType: '', newDescription: '', newImage: '',
        }));
        this.loading = false;
      },
    });
  }

  save(shot: Shot): void {
    if (!this.canEdit) return;
    this.shotListService.update(this.projectId, this.scriptId, shot.id, shot.shotType, shot.description, shot.image).subscribe();
  }

  remove(group: SceneGroup, shot: Shot): void {
    if (!this.canEdit) return;
    group.shots = group.shots.filter(s => s.id !== shot.id);
    this.shotListService.remove(this.projectId, this.scriptId, shot.id).subscribe();
  }

  async onImageSelected(group: SceneGroup, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      group.newImage = await fileToBackgroundDataUri(file);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not process that image.');
    }
  }

  addShot(group: SceneGroup): void {
    this.shotListService.add(
      this.projectId, this.scriptId, group.sceneKey,
      group.newShotType.trim(), group.newDescription.trim(), group.newImage,
    ).subscribe(shot => {
      group.shots.push(shot);
      group.newShotType = '';
      group.newDescription = '';
      group.newImage = '';
    });
  }
}
