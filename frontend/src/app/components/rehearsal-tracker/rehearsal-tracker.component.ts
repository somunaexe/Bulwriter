import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RehearsalService, Rehearsal } from '../../services/rehearsal.service';

@Component({
  selector: 'app-rehearsal-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rehearsal-tracker.component.html',
  styleUrls: ['./rehearsal-tracker.component.scss'],
})
export class RehearsalTrackerComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  rehearsals: Rehearsal[] = [];

  showAdd = false;
  newDate = '';
  newTime = '';
  newFocus = '';
  newNotes = '';

  constructor(private rehearsalService: RehearsalService) {}

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

    this.rehearsalService.list(this.projectId, this.scriptId).subscribe({
      next: rehearsals => {
        this.rehearsals = rehearsals;
        this.loading = false;
      },
      error: () => {
        this.rehearsals = [];
        this.loading = false;
      },
    });
  }

  toggleAdd(): void {
    if (!this.canEdit) return;
    this.showAdd = !this.showAdd;
  }

  save(rehearsal: Rehearsal): void {
    if (!this.canEdit) return;
    this.rehearsalService.update(
      this.projectId, this.scriptId, rehearsal.id, rehearsal.date, rehearsal.time, rehearsal.focus, rehearsal.notes,
    ).subscribe();
  }

  remove(rehearsal: Rehearsal): void {
    if (!this.canEdit) return;
    this.rehearsals = this.rehearsals.filter(r => r.id !== rehearsal.id);
    this.rehearsalService.remove(this.projectId, this.scriptId, rehearsal.id).subscribe();
  }

  addRehearsal(): void {
    const focus = this.newFocus.trim();
    if (!this.newDate && !focus) return;

    this.rehearsalService.add(this.projectId, this.scriptId, this.newDate, this.newTime, focus, this.newNotes.trim()).subscribe(rehearsal => {
      this.rehearsals.push(rehearsal);
      this.newDate = '';
      this.newTime = '';
      this.newFocus = '';
      this.newNotes = '';
    });
  }
}
