import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ContinuityNote {
  id: string;
  scriptId: string;
  sceneKey: string;
  take: string;
  note: string;
  flagged: boolean;
  position: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ContinuityService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<ContinuityNote[]> {
    return this.http.get<ContinuityNote[]>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/continuity`);
  }

  add(projectId: string, scriptId: string, sceneKey: string, take: string, note: string, flagged: boolean): Observable<ContinuityNote> {
    return this.http.post<ContinuityNote>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/continuity`,
      { sceneKey, take, note, flagged }
    );
  }

  update(projectId: string, scriptId: string, noteId: string, take: string, note: string, flagged: boolean): Observable<ContinuityNote> {
    return this.http.put<ContinuityNote>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/continuity/${noteId}`,
      { take, note, flagged }
    );
  }

  remove(projectId: string, scriptId: string, noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/continuity/${noteId}`);
  }
}
