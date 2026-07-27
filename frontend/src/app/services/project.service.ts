import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Project {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  // A data URI, resized/compressed client-side before upload — faintly
  // personalizes the editor's chrome. Absent for most projects.
  backgroundImage?: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(): Observable<Project[]> {
    return this.http.get<Project[]>(`${this.BASE}/projects`);
  }

  get(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.BASE}/projects/${id}`);
  }

  create(title: string): Observable<Project> {
    return this.http.post<Project>(`${this.BASE}/projects`, { title });
  }

  setBackground(id: string, dataUri: string): Observable<{ status: string }> {
    return this.http.put<{ status: string }>(`${this.BASE}/projects/${id}/background`, { image: dataUri });
  }

  clearBackground(id: string): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(`${this.BASE}/projects/${id}/background`);
  }
}