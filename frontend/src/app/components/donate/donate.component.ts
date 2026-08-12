import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DonateService } from '../../services/donate.service';

const PRESET_AMOUNTS = [5, 10, 25, 50, 100];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1000;

@Component({
  selector: 'app-donate',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './donate.component.html',
  styleUrl: './donate.component.scss',
})
export class DonateComponent implements OnInit {
  presetAmounts = PRESET_AMOUNTS;
  selectedAmount: number | null = PRESET_AMOUNTS[1];
  customAmount: number | null = null;
  interval: '' | 'month' = '';
  submitting = false;
  error = '';

  // Set from the ?status= query param Stripe redirects back with after
  // checkout completes or is abandoned — null while the picker itself is
  // showing (i.e. before a donor has gone through checkout at all).
  status: 'success' | 'canceled' | null = null;

  constructor(
    private donateService: DonateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const s = this.route.snapshot.queryParams['status'];
    this.status = s === 'success' || s === 'canceled' ? s : null;
  }

  get amount(): number | null {
    return this.customAmount && this.customAmount > 0 ? this.customAmount : this.selectedAmount;
  }

  get validAmount(): boolean {
    const a = this.amount;
    return !!a && a >= MIN_AMOUNT && a <= MAX_AMOUNT;
  }

  selectPreset(a: number): void {
    this.selectedAmount = a;
    this.customAmount = null;
  }

  onCustomInput(): void {
    // A custom amount always wins over whichever preset button is still
    // visually "selected" from before the user started typing.
    this.selectedAmount = null;
  }

  setInterval(interval: '' | 'month'): void {
    this.interval = interval;
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  // Clears the ?status=canceled param so the amount picker shows again,
  // without a full page reload.
  tryAgain(): void {
    this.status = null;
    this.router.navigate([], { queryParams: {} });
  }

  donate(): void {
    if (!this.validAmount || this.submitting) return;

    this.error = '';
    this.submitting = true;
    const amountCents = Math.round(this.amount! * 100);

    this.donateService.createCheckout(amountCents, this.interval).subscribe({
      next: ({ url }) => { window.location.href = url; },
      error: err => {
        this.error = err?.error?.error || 'Could not start checkout — please try again in a moment.';
        this.submitting = false;
      },
    });
  }
}
