import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreditsService, CreditsCastRow, CreditsCrewRow } from '../../services/credits.service';
import { buildCreditsText, downloadText } from '../../editor/credits-text';
import { scriptExportFilename } from '../../editor/export-filename';

@Component({
  selector: 'app-credits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './credits.component.html',
  styleUrls: ['./credits.component.scss'],
})
export class CreditsComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() scriptTitle = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  cast: CreditsCastRow[] = [];
  crew: CreditsCrewRow[] = [];
  additionalCredits = '';

  constructor(private creditsService: CreditsService) {}

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

    this.creditsService.get(this.projectId, this.scriptId).subscribe({
      next: ({ credits, cast, crew }) => {
        this.additionalCredits = credits.additionalCredits;
        this.cast = cast;
        this.crew = crew;
        this.loading = false;
      },
      error: () => {
        this.additionalCredits = '';
        this.cast = [];
        this.crew = [];
        this.loading = false;
      },
    });
  }

  saveAdditionalCredits(): void {
    if (!this.canEdit) return;
    this.creditsService.set(this.projectId, this.scriptId, this.additionalCredits).subscribe();
  }

  exportText(): void {
    const text = buildCreditsText(this.scriptTitle, this.cast, this.crew, this.additionalCredits);
    downloadText(text, scriptExportFilename(this.scriptTitle, this.scriptId, 'credits'));
  }
}
