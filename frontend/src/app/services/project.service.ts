import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Project {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
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
}