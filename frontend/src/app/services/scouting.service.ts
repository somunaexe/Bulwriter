import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ScoutCandidate {
  id: string;
  scriptId: string;
  locationKey: string;
  name: string;
  address: string;
  notes: string;
  photo: string;
  isSelected: boolean;
  position: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ScoutingService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<ScoutCandidate[]> {
    return this.http.get<ScoutCandidate[]>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/scouting`
    );
  }

  add(projectId: string, scriptId: string, locationKey: string, name: string, address: string, notes: string, photo: string): Observable<ScoutCandidate> {
    return this.http.post<ScoutCandidate>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/scouting`,
      { locationKey, name, address, notes, photo }
    );
  }

  update(projectId: string, scriptId: string, candidateId: string, name: string, address: string, notes: string, photo: string): Observable<ScoutCandidate> {
    return this.http.put<ScoutCandidate>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/scouting/${candidateId}`,
      { name, address, notes, photo }
    );
  }

  select(projectId: string, scriptId: string, candidateId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/scouting/${candidateId}/select`, {}
    );
  }

  remove(projectId: string, scriptId: string, candidateId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/scouting/${candidateId}`
    );
  }
}
