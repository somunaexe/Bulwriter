import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type CastingStatus = 'open' | 'submitted' | 'callback' | 'cast';

export interface CastingRole {
  id: string;
  scriptId: string;
  characterName: string;
  actorName: string;
  contact: string;
  status: CastingStatus;
  notes: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class CastingService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<CastingRole[]> {
    return this.http.get<CastingRole[]>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/casting`
    );
  }

  upsert(
    projectId: string, scriptId: string,
    characterName: string, actorName: string, contact: string, status: CastingStatus, notes: string,
  ): Observable<CastingRole> {
    return this.http.put<CastingRole>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/casting`,
      { characterName, actorName, contact, status, notes }
    );
  }
}
