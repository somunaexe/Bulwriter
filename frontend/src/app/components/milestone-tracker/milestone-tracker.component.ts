import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MilestoneService, Milestone, MilestoneStatus } from '../../services/milestone.service';

const STATUSES: MilestoneStatus[] = ['not_started', 'in_progress', 'done'];

@Component({
  selector: 'app-milestone-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './milestone-tracker.component.html',
  styleUrls: ['./milestone-tracker.component.scss'],
})
export class MilestoneTrackerComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  milestones: Milestone[] = [];
  statuses = STATUSES;

  showAdd = false;
  newLabel = '';
  newStatus: MilestoneStatus = 'not_started';
  newNotes = '';

  constructor(private milestoneService: MilestoneService) {}

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

    this.milestoneService.list(this.projectId, this.scriptId).subscribe({
      next: milestones => {
        this.milestones = milestones;
        this.loading = false;
      },
      error: () => {
        this.milestones = [];
        this.loading = false;
      },
    });
  }

  toggleAdd(): void {
    if (!this.canEdit) return;
    this.showAdd = !this.showAdd;
  }

  save(milestone: Milestone): void {
    if (!this.canEdit) return;
    this.milestoneService.update(
      this.projectId, this.scriptId, milestone.id, milestone.label, milestone.status, milestone.notes,
    ).subscribe();
  }

  remove(milestone: Milestone): void {
    if (!this.canEdit) return;
    this.milestones = this.milestones.filter(m => m.id !== milestone.id);
    this.milestoneService.remove(this.projectId, this.scriptId, milestone.id).subscribe();
  }

  addMilestone(): void {
    const label = this.newLabel.trim();
    if (!label) return;

    this.milestoneService.add(this.projectId, this.scriptId, label, this.newStatus, this.newNotes.trim()).subscribe(milestone => {
      this.milestones.push(milestone);
      this.newLabel = '';
      this.newStatus = 'not_started';
      this.newNotes = '';
    });
  }
}
