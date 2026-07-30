import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type MilestoneStatus = 'not_started' | 'in_progress' | 'done';

export interface Milestone {
  id: string;
  scriptId: string;
  label: string;
  status: MilestoneStatus;
  notes: string;
  position: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class MilestoneService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<Milestone[]> {
    return this.http.get<Milestone[]>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/milestones`);
  }

  add(projectId: string, scriptId: string, label: string, status: MilestoneStatus, notes: string): Observable<Milestone> {
    return this.http.post<Milestone>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/milestones`,
      { label, status, notes }
    );
  }

  update(projectId: string, scriptId: string, milestoneId: string, label: string, status: MilestoneStatus, notes: string): Observable<Milestone> {
    return this.http.put<Milestone>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/milestones/${milestoneId}`,
      { label, status, notes }
    );
  }

  remove(projectId: string, scriptId: string, milestoneId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/milestones/${milestoneId}`);
  }
}
