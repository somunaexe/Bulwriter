import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DistributionService, FestivalSubmission, FestivalStatus, ReleaseLink } from '../../services/distribution.service';

const FESTIVAL_STATUSES: FestivalStatus[] = ['planned', 'submitted', 'accepted', 'rejected', 'withdrawn'];

@Component({
  selector: 'app-festival-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './festival-tracker.component.html',
  styleUrls: ['./festival-tracker.component.scss'],
})
export class FestivalTrackerComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  festivals: FestivalSubmission[] = [];
  releaseLinks: ReleaseLink[] = [];
  statuses = FESTIVAL_STATUSES;

  showAddFestival = false;
  newFestivalName = '';
  newDeadline = '';
  newFee: number | null = null;
  newPremiereRequired = false;
  newFestivalNotes = '';

  showAddRelease = false;
  newPlatform = '';
  newUrl = '';
  newReleaseDate = '';
  newReleaseNotes = '';

  constructor(private distributionService: DistributionService) {}

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

    this.distributionService.listFestivals(this.projectId, this.scriptId).subscribe({
      next: festivals => this.festivals = festivals,
      error: () => this.festivals = [],
    });

    this.distributionService.listReleaseLinks(this.projectId, this.scriptId).subscribe({
      next: links => {
        this.releaseLinks = links;
        this.loading = false;
      },
      error: () => {
        this.releaseLinks = [];
        this.loading = false;
      },
    });
  }

  // ── Festival submissions ──────────────────────────────────────────

  toggleAddFestival(): void {
    if (!this.canEdit) return;
    this.showAddFestival = !this.showAddFestival;
  }

  saveFestival(f: FestivalSubmission): void {
    if (!this.canEdit) return;
    this.distributionService.updateFestival(
      this.projectId, this.scriptId, f.id, f.festivalName, f.deadline, f.fee, f.status, f.premiereRequired, f.notes,
    ).subscribe();
  }

  removeFestival(f: FestivalSubmission): void {
    if (!this.canEdit) return;
    this.festivals = this.festivals.filter(x => x.id !== f.id);
    this.distributionService.removeFestival(this.projectId, this.scriptId, f.id).subscribe();
  }

  addFestival(): void {
    const name = this.newFestivalName.trim();
    if (!name) return;

    this.distributionService.addFestival(
      this.projectId, this.scriptId, name, this.newDeadline, this.newFee ?? 0, 'planned', this.newPremiereRequired, this.newFestivalNotes.trim(),
    ).subscribe(f => {
      this.festivals.push(f);
      this.newFestivalName = '';
      this.newDeadline = '';
      this.newFee = null;
      this.newPremiereRequired = false;
      this.newFestivalNotes = '';
    });
  }

  // ── Release links ────────────────────────────────────────────────

  toggleAddRelease(): void {
    if (!this.canEdit) return;
    this.showAddRelease = !this.showAddRelease;
  }

  saveRelease(l: ReleaseLink): void {
    if (!this.canEdit) return;
    this.distributionService.updateReleaseLink(this.projectId, this.scriptId, l.id, l.platform, l.url, l.releaseDate, l.notes).subscribe();
  }

  removeRelease(l: ReleaseLink): void {
    if (!this.canEdit) return;
    this.releaseLinks = this.releaseLinks.filter(x => x.id !== l.id);
    this.distributionService.removeReleaseLink(this.projectId, this.scriptId, l.id).subscribe();
  }

  addRelease(): void {
    const platform = this.newPlatform.trim();
    if (!platform) return;

    this.distributionService.addReleaseLink(
      this.projectId, this.scriptId, platform, this.newUrl.trim(), this.newReleaseDate, this.newReleaseNotes.trim(),
    ).subscribe(l => {
      this.releaseLinks.push(l);
      this.newPlatform = '';
      this.newUrl = '';
      this.newReleaseDate = '';
      this.newReleaseNotes = '';
    });
  }
}
