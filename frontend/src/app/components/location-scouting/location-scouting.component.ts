import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { ScoutingService, ScoutCandidate } from '../../services/scouting.service';
import { computeSceneList } from '../../editor/scene-breakdown';
import { normalizeLocation } from '../../editor/stripboard';
import { fileToBackgroundDataUri } from '../../editor/background-image';

interface LocationGroup {
  locationKey: string;
  candidates: ScoutCandidate[];
  newName: string;
  newAddress: string;
  newPhoto: string;
  newPhotoFilename: string;
}

@Component({
  selector: 'app-location-scouting',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './location-scouting.component.html',
  styleUrls: ['./location-scouting.component.scss'],
})
export class LocationScoutingComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  groups: LocationGroup[] = [];

  constructor(
    private sync: SyncService,
    private scoutingService: ScoutingService,
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
    const locationKeys: string[] = [];
    for (const scene of scenes) {
      const key = normalizeLocation(scene.heading);
      if (!locationKeys.includes(key)) locationKeys.push(key);
    }

    this.scoutingService.list(this.projectId, this.scriptId).subscribe({
      next: candidates => {
        const byKey = new Map<string, ScoutCandidate[]>();
        for (const c of candidates) {
          if (!byKey.has(c.locationKey)) byKey.set(c.locationKey, []);
          byKey.get(c.locationKey)!.push(c);
        }
        // Locations already tagged with candidates but no longer in the
        // live script still show up — no reason to hide scouting work
        // just because a scene heading changed since.
        for (const key of byKey.keys()) {
          if (!locationKeys.includes(key)) locationKeys.push(key);
        }

        this.groups = locationKeys.map(key => ({
          locationKey: key,
          candidates: byKey.get(key) ?? [],
          newName: '',
          newAddress: '',
          newPhoto: '',
          newPhotoFilename: '',
        }));
        this.loading = false;
      },
      error: () => {
        this.groups = locationKeys.map(key => ({
          locationKey: key, candidates: [], newName: '', newAddress: '', newPhoto: '', newPhotoFilename: '',
        }));
        this.loading = false;
      },
    });
  }

  save(candidate: ScoutCandidate): void {
    if (!this.canEdit) return;
    this.scoutingService.update(
      this.projectId, this.scriptId, candidate.id,
      candidate.name, candidate.address, candidate.notes, candidate.photo, candidate.photoFilename,
    ).subscribe();
  }

  select(group: LocationGroup, candidate: ScoutCandidate): void {
    if (!this.canEdit) return;
    group.candidates.forEach(c => c.isSelected = c.id === candidate.id);
    this.scoutingService.select(this.projectId, this.scriptId, candidate.id).subscribe();
  }

  remove(group: LocationGroup, candidate: ScoutCandidate): void {
    if (!this.canEdit) return;
    group.candidates = group.candidates.filter(c => c.id !== candidate.id);
    this.scoutingService.remove(this.projectId, this.scriptId, candidate.id).subscribe();
  }

  // Clears a candidate's photo without needing a replacement file ready
  // — persists immediately, same as any other field edit.
  removePhoto(candidate: ScoutCandidate): void {
    if (!this.canEdit) return;
    candidate.photo = '';
    candidate.photoFilename = '';
    this.save(candidate);
  }

  removeNewPhoto(group: LocationGroup): void {
    group.newPhoto = '';
    group.newPhotoFilename = '';
  }

  async onPhotoSelected(candidate: ScoutCandidate, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      candidate.photo = await fileToBackgroundDataUri(file);
      candidate.photoFilename = file.name;
      this.save(candidate);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not process that image.');
    }
  }

  async onNewPhotoSelected(group: LocationGroup, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      group.newPhoto = await fileToBackgroundDataUri(file);
      group.newPhotoFilename = file.name;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not process that image.');
    }
  }

  addCandidate(group: LocationGroup): void {
    const name = group.newName.trim();
    if (!name) return;

    this.scoutingService.add(
      this.projectId, this.scriptId, group.locationKey,
      name, group.newAddress.trim(), '', group.newPhoto, group.newPhotoFilename,
    ).subscribe(candidate => {
      group.candidates.push(candidate);
      group.newName = '';
      group.newAddress = '';
      group.newPhoto = '';
      group.newPhotoFilename = '';
    });
  }
}
