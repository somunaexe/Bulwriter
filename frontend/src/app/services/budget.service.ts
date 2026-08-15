import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface BudgetEstimate {
  scriptId: string;
  dayRate: number;
  locationRate: number;
  castRate: number;
  propRate: number;
  updatedAt: string;
}

export interface BudgetLineItem {
  id: string;
  scriptId: string;
  label: string;
  amount: number;
  position: number;
  // True when added from a highlighted script selection rather than
  // typed freeform — drives whether the "show in script" jump is shown.
  linked: boolean;
  createdAt: string;
}

export interface BudgetResponse {
  estimate: BudgetEstimate;
  lineItems: BudgetLineItem[];
}

export interface BudgetRates {
  dayRate: number;
  locationRate: number;
  castRate: number;
  propRate: number;
}

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get(projectId: string, scriptId: string): Observable<BudgetResponse> {
    return this.http.get<BudgetResponse>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/budget`);
  }

  setEstimate(projectId: string, scriptId: string, rates: BudgetRates): Observable<BudgetEstimate> {
    return this.http.put<BudgetEstimate>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/budget`, rates);
  }

  addLineItem(projectId: string, scriptId: string, label: string, amount: number, linked = false): Observable<BudgetLineItem> {
    return this.http.post<BudgetLineItem>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/budget/line-items`,
      { label, amount, linked }
    );
  }

  removeLineItem(projectId: string, scriptId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/budget/line-items/${itemId}`
    );
  }
}
