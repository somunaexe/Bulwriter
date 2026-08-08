import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CheckoutSession {
  url: string;
}

@Injectable({ providedIn: 'root' })
export class DonateService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // interval is '' for a one-time donation or 'month' for a recurring
  // sponsorship. Public endpoint — no auth header required, unlike every
  // other service in the app.
  createCheckout(amountCents: number, interval: '' | 'month'): Observable<CheckoutSession> {
    return this.http.post<CheckoutSession>(`${this.BASE}/donate/checkout`, { amountCents, interval });
  }
}
