import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface StoryBible {
  projectId: string;
  coreQuestion: string;
  genre: string;
  tone: string;
  theme: string;
  updatedAt: string;
}

export interface IdeaNote {
  id: string;
  projectId: string;
  text: string;
  position: number;
  createdAt: string;
}

export interface StoryScriptRow {
  scriptId: string;
  title: string;
  logline: string;
  synopsis: string;
}

export interface StoryResponse {
  bible: StoryBible;
  ideaNotes: IdeaNote[];
  scripts: StoryScriptRow[];
}

export interface BibleFields {
  coreQuestion: string;
  genre: string;
  tone: string;
  theme: string;
}

// What POST /story/generate returns — a draft inferred from an uploaded
// document, never saved on its own. The caller reviews/edits it, then
// persists the pieces it wants via setBible()/setScriptStory() like any
// other edit.
export interface StoryBibleDraft {
  genre: string;
  tone: string;
  theme: string;
  coreQuestion: string;
  logline: string;
  synopsis: string;
}

@Injectable({ providedIn: 'root' })
export class StoryService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get(projectId: string): Observable<StoryResponse> {
    return this.http.get<StoryResponse>(`${this.BASE}/projects/${projectId}/story`);
  }

  setBible(projectId: string, fields: BibleFields): Observable<StoryBible> {
    return this.http.put<StoryBible>(`${this.BASE}/projects/${projectId}/story`, fields);
  }

  addIdeaNote(projectId: string, text: string): Observable<IdeaNote> {
    return this.http.post<IdeaNote>(`${this.BASE}/projects/${projectId}/story/notes`, { text });
  }

  updateIdeaNote(projectId: string, noteId: string, text: string): Observable<IdeaNote> {
    return this.http.put<IdeaNote>(`${this.BASE}/projects/${projectId}/story/notes/${noteId}`, { text });
  }

  removeIdeaNote(projectId: string, noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/story/notes/${noteId}`);
  }

  // Sends the full note order after a drag-and-drop drop, rather than a
  // series of single-step moves.
  reorderIdeaNotes(projectId: string, orderedIds: string[]): Observable<void> {
    return this.http.put<void>(`${this.BASE}/projects/${projectId}/story/notes/reorder`, { orderedIds });
  }

  setScriptStory(projectId: string, scriptId: string, logline: string, synopsis: string): Observable<void> {
    return this.http.put<void>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/story`,
      { logline, synopsis }
    );
  }

  // Sends already-extracted document text to the backend, which asks
  // Claude to infer story bible fields from it. Returns a draft for the
  // caller to show for review — nothing is saved server-side.
  generate(projectId: string, text: string): Observable<StoryBibleDraft> {
    return this.http.post<StoryBibleDraft>(`${this.BASE}/projects/${projectId}/story/generate`, { text });
  }
}
