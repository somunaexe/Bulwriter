import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type CastingStatus = 'open' | 'submitted' | 'callback';

export interface CastingCandidate {
  id: string;
  scriptId: string;
  characterName: string;
  actorName: string;
  contact: string;
  status: CastingStatus;
  notes: string;
  isCast: boolean;
  position: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class CastingService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<CastingCandidate[]> {
    return this.http.get<CastingCandidate[]>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/casting`
    );
  }

  add(
    projectId: string, scriptId: string,
    characterName: string, actorName: string, contact: string, status: CastingStatus, notes: string,
  ): Observable<CastingCandidate> {
    return this.http.post<CastingCandidate>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/casting`,
      { characterName, actorName, contact, status, notes }
    );
  }

  update(
    projectId: string, scriptId: string, candidateId: string,
    actorName: string, contact: string, status: CastingStatus, notes: string,
  ): Observable<CastingCandidate> {
    return this.http.put<CastingCandidate>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/casting/${candidateId}`,
      { actorName, contact, status, notes }
    );
  }

  cast(projectId: string, scriptId: string, candidateId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/casting/${candidateId}/cast`, {}
    );
  }

  remove(projectId: string, scriptId: string, candidateId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/casting/${candidateId}`
    );
  }
}
