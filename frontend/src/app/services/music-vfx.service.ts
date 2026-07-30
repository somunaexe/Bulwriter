import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type SceneNoteKind = 'music' | 'vfx';
export type SceneNoteStatus = 'suggested' | 'confirmed' | 'done';

export interface SceneNote {
  id: string;
  scriptId: string;
  sceneKey: string;
  kind: SceneNoteKind;
  description: string;
  status: SceneNoteStatus;
  notes: string;
  position: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class MusicVfxService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<SceneNote[]> {
    return this.http.get<SceneNote[]>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/music-vfx`);
  }

  add(
    projectId: string, scriptId: string, sceneKey: string, kind: SceneNoteKind,
    description: string, status: SceneNoteStatus, notes: string,
  ): Observable<SceneNote> {
    return this.http.post<SceneNote>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/music-vfx`,
      { sceneKey, kind, description, status, notes }
    );
  }

  update(
    projectId: string, scriptId: string, noteId: string,
    description: string, status: SceneNoteStatus, notes: string,
  ): Observable<SceneNote> {
    return this.http.put<SceneNote>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/music-vfx/${noteId}`,
      { description, status, notes }
    );
  }

  remove(projectId: string, scriptId: string, noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/music-vfx/${noteId}`);
  }
}
