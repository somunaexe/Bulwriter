import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { ShotListService, Shot, ShotFields } from '../../services/shot-list.service';
import { computeSceneList } from '../../editor/scene-breakdown';
import { fileToBackgroundDataUri } from '../../editor/background-image';

interface SceneGroup {
  sceneKey: string;
  heading: string;
  shots: Shot[];
  showAdd: boolean;
  newShotSize: string;
  newCameraAngle: string;
  newCameraMovement: string;
  newDescription: string;
  newImage: string;
  newImageFilename: string;
}

function emptyGroup(sceneKey: string, heading: string, shots: Shot[]): SceneGroup {
  return {
    sceneKey, heading, shots, showAdd: false,
    newShotSize: '', newCameraAngle: '', newCameraMovement: '',
    newDescription: '', newImage: '', newImageFilename: '',
  };
}

function fields(shot: Pick<Shot, 'shotSize' | 'cameraAngle' | 'cameraMovement' | 'description' | 'image' | 'imageFilename'>): ShotFields {
  return {
    shotSize: shot.shotSize,
    cameraAngle: shot.cameraAngle,
    cameraMovement: shot.cameraMovement,
    description: shot.description,
    image: shot.image,
    imageFilename: shot.imageFilename,
  };
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

        this.groups = scenes.map(scene => emptyGroup(scene.sceneKey, scene.heading, byKey.get(scene.sceneKey) ?? []));

        // A scene already tagged with shots but no longer in the live
        // script (heading changed/removed) still shows — same reasoning
        // as breakdown/casting: no reason to hide prep work already done.
        const sceneKeys = new Set(scenes.map(s => s.sceneKey));
        for (const [key, list] of byKey) {
          if (!sceneKeys.has(key)) this.groups.push(emptyGroup(key, key, list));
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

  save(shot: Shot): void {
    if (!this.canEdit) return;
    this.shotListService.update(this.projectId, this.scriptId, shot.id, fields(shot)).subscribe();
  }

  remove(group: SceneGroup, shot: Shot): void {
    if (!this.canEdit) return;
    group.shots = group.shots.filter(s => s.id !== shot.id);
    this.shotListService.remove(this.projectId, this.scriptId, shot.id).subscribe();
  }

  // Clears a shot's storyboard image without needing a replacement file
  // ready — persists immediately, same as any other field edit.
  removeImage(shot: Shot): void {
    if (!this.canEdit) return;
    shot.image = '';
    shot.imageFilename = '';
    this.save(shot);
  }

  removeNewImage(group: SceneGroup): void {
    group.newImage = '';
    group.newImageFilename = '';
  }

  async onImageSelected(shot: Shot, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      shot.image = await fileToBackgroundDataUri(file);
      shot.imageFilename = file.name;
      this.save(shot);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not process that image.');
    }
  }

  async onNewImageSelected(group: SceneGroup, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      group.newImage = await fileToBackgroundDataUri(file);
      group.newImageFilename = file.name;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not process that image.');
    }
  }

  addShot(group: SceneGroup): void {
    this.shotListService.add(this.projectId, this.scriptId, group.sceneKey, {
      shotSize: group.newShotSize.trim(),
      cameraAngle: group.newCameraAngle.trim(),
      cameraMovement: group.newCameraMovement.trim(),
      description: group.newDescription.trim(),
      image: group.newImage,
      imageFilename: group.newImageFilename,
    }).subscribe(shot => {
      group.shots.push(shot);
      group.newShotSize = '';
      group.newCameraAngle = '';
      group.newCameraMovement = '';
      group.newDescription = '';
      group.newImage = '';
      group.newImageFilename = '';
    });
  }
}
