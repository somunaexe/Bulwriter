import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Script {
  id: string;
  title: string;
  projectId: string;
  createdAt: string;
  deletedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ScriptService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(project_id: string): Observable<Script[]> {
    return this.http.get<Script[]>(`${this.BASE}/projects/${project_id}/scripts`);
  }

  get(project_id: string, id: string): Observable<Script> {
    return this.http.get<Script>(`${this.BASE}/projects/${project_id}/scripts/${id}`);
  }

  create(project_id: string, title: string): Observable<Script> {
    return this.http.post<Script>(`${this.BASE}/projects/${project_id}/scripts`, { title });
  }

  rename(project_id: string, id: string, title: string): Observable<void> {
    return this.http.put<void>(`${this.BASE}/projects/${project_id}/scripts/${id}`, { title });
  }

  // Moves a script to the trash — recoverable via restore() for 30 days.
  remove(project_id: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${project_id}/scripts/${id}`);
  }

  listTrash(project_id: string): Observable<Script[]> {
    return this.http.get<Script[]>(`${this.BASE}/projects/${project_id}/trash/scripts`);
  }

  restore(project_id: string, id: string): Observable<void> {
    return this.http.post<void>(`${this.BASE}/projects/${project_id}/trash/scripts/${id}/restore`, {});
  }

  // Immediately, permanently deletes an already-trashed script, skipping
  // the rest of its 30-day retention window.
  purgeNow(project_id: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${project_id}/trash/scripts/${id}`);
  }
}