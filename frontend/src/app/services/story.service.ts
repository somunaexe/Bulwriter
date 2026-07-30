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

  removeIdeaNote(projectId: string, noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/story/notes/${noteId}`);
  }

  setScriptStory(projectId: string, scriptId: string, logline: string, synopsis: string): Observable<void> {
    return this.http.put<void>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/story`,
      { logline, synopsis }
    );
  }
}
