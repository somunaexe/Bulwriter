import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { SceneBreakdownService } from '../../services/scene-breakdown.service';
import { ScheduleService } from '../../services/schedule.service';
import { BudgetService, BudgetLineItem } from '../../services/budget.service';
import { ModalComponent } from '../modal/modal.component';
import { computeSceneList } from '../../editor/scene-breakdown';
import { autoSuggestDays, normalizeLocation } from '../../editor/stripboard';

@Component({
  selector: 'app-budget-estimator',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  templateUrl: './budget-estimator.component.html',
  styleUrls: ['./budget-estimator.component.scss'],
})
export class BudgetEstimatorComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;

  // Counts derived from the breakdown/schedule — the same data those
  // features already compute, not re-modeled here.
  dayCount = 0;
  locationCount = 0;
  castCount = 0;
  propCount = 0;

  dayRate = 0;
  locationRate = 0;
  castRate = 0;
  propRate = 0;

  lineItems: BudgetLineItem[] = [];
  newItemLabel = '';
  newItemAmount: number | null = null;

  constructor(
    private sync: SyncService,
    private breakdownService: SceneBreakdownService,
    private scheduleService: ScheduleService,
    private budgetService: BudgetService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scriptId'] || changes['projectId']) this.load();
  }

  private load(): void {
    if (!this.projectId || !this.scriptId) return;
    this.loading = true;

    const doc = this.sync.getDoc();
    const scenes = doc ? computeSceneList(doc) : [];

    this.locationCount = new Set(scenes.map(s => normalizeLocation(s.heading))).size;
    this.castCount = new Set(scenes.flatMap(s => s.cast)).size;

    // A rough day count is all a budget estimate needs — reuses the
    // stripboard's own grouping when a schedule's been saved, or its
    // auto-suggestion when one hasn't, rather than re-deriving either.
    this.scheduleService.list(this.projectId, this.scriptId).subscribe({
      next: ({ strips }) => {
        this.dayCount = strips.length
          ? new Set(strips.map(s => s.dayNumber)).size
          : autoSuggestDays(scenes).length;
      },
      error: () => {
        this.dayCount = autoSuggestDays(scenes).length;
      },
    });

    this.breakdownService.list(this.projectId, this.scriptId).subscribe({
      next: tags => {
        this.propCount = new Set(tags.flatMap(t => t.props)).size;
      },
      error: () => {
        this.propCount = 0;
      },
    });

    this.budgetService.get(this.projectId, this.scriptId).subscribe({
      next: ({ estimate, lineItems }) => {
        this.dayRate = estimate.dayRate;
        this.locationRate = estimate.locationRate;
        this.castRate = estimate.castRate;
        this.propRate = estimate.propRate;
        this.lineItems = lineItems;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  get dayTotal(): number { return this.dayCount * this.dayRate; }
  get locationTotal(): number { return this.locationCount * this.locationRate; }
  get castTotal(): number { return this.castCount * this.castRate; }
  get propTotal(): number { return this.propCount * this.propRate; }
  get lineItemsTotal(): number { return this.lineItems.reduce((sum, li) => sum + li.amount, 0); }
  get grandTotal(): number {
    return this.dayTotal + this.locationTotal + this.castTotal + this.propTotal + this.lineItemsTotal;
  }

  saveRates(): void {
    if (!this.canEdit) return;
    this.budgetService.setEstimate(this.projectId, this.scriptId, {
      dayRate: this.dayRate || 0,
      locationRate: this.locationRate || 0,
      castRate: this.castRate || 0,
      propRate: this.propRate || 0,
    }).subscribe();
  }

  addLineItem(): void {
    const label = this.newItemLabel.trim();
    const amount = this.newItemAmount;
    if (!label || amount === null || Number.isNaN(amount)) return;

    this.budgetService.addLineItem(this.projectId, this.scriptId, label, amount).subscribe(item => {
      this.lineItems.push(item);
      this.newItemLabel = '';
      this.newItemAmount = null;
    });
  }

  removeLineItem(item: BudgetLineItem): void {
    this.lineItems = this.lineItems.filter(li => li.id !== item.id);
    this.budgetService.removeLineItem(this.projectId, this.scriptId, item.id).subscribe();
  }
}
