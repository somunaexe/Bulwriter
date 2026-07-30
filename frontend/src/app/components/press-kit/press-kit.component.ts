import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PressKitService, PressKit, Still, PressKitCastRow, PressKitCrewRow } from '../../services/press-kit.service';
import { fileToBackgroundDataUri } from '../../editor/background-image';
import { scriptExportFilename } from '../../editor/export-filename';

@Component({
  selector: 'app-press-kit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './press-kit.component.html',
  styleUrls: ['./press-kit.component.scss'],
})
export class PressKitComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() scriptTitle = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  pressKit: PressKit | null = null;
  stills: Still[] = [];
  logline = '';
  synopsis = '';
  cast: PressKitCastRow[] = [];
  crew: PressKitCrewRow[] = [];

  showAddStill = false;
  newStillImage = '';
  newStillImageFilename = '';
  newStillCaption = '';

  exporting = false;

  constructor(private pressKitService: PressKitService) {}

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

    this.pressKitService.get(this.projectId, this.scriptId).subscribe({
      next: res => {
        this.pressKit = res.pressKit;
        this.stills = res.stills;
        this.logline = res.logline;
        this.synopsis = res.synopsis;
        this.cast = res.cast;
        this.crew = res.crew;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  saveDirectorStatement(): void {
    if (!this.canEdit || !this.pressKit) return;
    this.pressKitService.set(
      this.projectId, this.scriptId,
      this.pressKit.directorStatement, this.pressKit.poster, this.pressKit.posterFilename,
    ).subscribe();
  }

  async onPosterSelected(event: Event): Promise<void> {
    if (!this.canEdit || !this.pressKit) return;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      this.pressKit.poster = await fileToBackgroundDataUri(file);
      this.pressKit.posterFilename = file.name;
      this.saveDirectorStatement();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not process that image.');
    }
  }

  removePoster(): void {
    if (!this.canEdit || !this.pressKit) return;
    this.pressKit.poster = '';
    this.pressKit.posterFilename = '';
    this.saveDirectorStatement();
  }

  toggleAddStill(): void {
    if (!this.canEdit) return;
    this.showAddStill = !this.showAddStill;
  }

  async onNewStillImageSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      this.newStillImage = await fileToBackgroundDataUri(file);
      this.newStillImageFilename = file.name;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not process that image.');
    }
  }

  removeNewStillImage(): void {
    this.newStillImage = '';
    this.newStillImageFilename = '';
  }

  addStill(): void {
    if (!this.newStillImage) return;
    this.pressKitService.addStill(this.projectId, this.scriptId, this.newStillImage, this.newStillImageFilename, this.newStillCaption.trim())
      .subscribe(still => {
        this.stills.push(still);
        this.newStillImage = '';
        this.newStillImageFilename = '';
        this.newStillCaption = '';
      });
  }

  saveStillCaption(still: Still): void {
    if (!this.canEdit) return;
    this.pressKitService.updateStill(this.projectId, this.scriptId, still.id, still.image, still.imageFilename, still.caption).subscribe();
  }

  async onStillImageSelected(still: Still, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      still.image = await fileToBackgroundDataUri(file);
      still.imageFilename = file.name;
      this.saveStillCaption(still);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not process that image.');
    }
  }

  removeStillImage(still: Still): void {
    if (!this.canEdit) return;
    still.image = '';
    still.imageFilename = '';
    this.saveStillCaption(still);
  }

  removeStill(still: Still): void {
    if (!this.canEdit) return;
    this.stills = this.stills.filter(s => s.id !== still.id);
    this.pressKitService.removeStill(this.projectId, this.scriptId, still.id).subscribe();
  }

  saveCastBio(row: PressKitCastRow): void {
    if (!this.canEdit) return;
    this.pressKitService.setBio(this.projectId, this.scriptId, 'cast', row.candidateId, row.bio).subscribe();
  }

  saveCrewBio(row: PressKitCrewRow): void {
    if (!this.canEdit) return;
    this.pressKitService.setBio(this.projectId, this.scriptId, 'crew', row.memberId, row.bio).subscribe();
  }

  async exportPdf(): Promise<void> {
    if (this.exporting) return;
    this.exporting = true;
    try {
      const { exportPressKitPdf } = await import('../../editor/press-kit-pdf');
      await exportPressKitPdf({
        scriptTitle: this.scriptTitle || 'Untitled script',
        logline: this.logline,
        synopsis: this.synopsis,
        directorStatement: this.pressKit?.directorStatement ?? '',
        poster: this.pressKit?.poster ?? '',
        stills: this.stills,
        cast: this.cast,
        crew: this.crew,
        filename: scriptExportFilename(this.scriptTitle, this.scriptId, 'press kit'),
      });
    } catch (err) {
      console.error('Press kit export failed:', err);
    } finally {
      this.exporting = false;
    }
  }
}
