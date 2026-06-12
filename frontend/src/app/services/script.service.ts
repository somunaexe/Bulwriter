import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Script {
  id: string;
  title: string;
  projectId: string;
  createdAt: string;
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
}