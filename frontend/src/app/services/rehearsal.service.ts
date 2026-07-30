import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Rehearsal {
  id: string;
  scriptId: string;
  date: string;
  time: string;
  focus: string;
  notes: string;
  position: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class RehearsalService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<Rehearsal[]> {
    return this.http.get<Rehearsal[]>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/rehearsals`);
  }

  add(projectId: string, scriptId: string, date: string, time: string, focus: string, notes: string): Observable<Rehearsal> {
    return this.http.post<Rehearsal>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/rehearsals`,
      { date, time, focus, notes }
    );
  }

  update(projectId: string, scriptId: string, rehearsalId: string, date: string, time: string, focus: string, notes: string): Observable<Rehearsal> {
    return this.http.put<Rehearsal>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/rehearsals/${rehearsalId}`,
      { date, time, focus, notes }
    );
  }

  remove(projectId: string, scriptId: string, rehearsalId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/rehearsals/${rehearsalId}`);
  }
}
