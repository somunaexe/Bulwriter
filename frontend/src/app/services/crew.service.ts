import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CrewMember {
  id: string;
  projectId: string;
  role: string;
  name: string;
  contact: string;
  notes: string;
  position: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class CrewService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string): Observable<CrewMember[]> {
    return this.http.get<CrewMember[]>(`${this.BASE}/projects/${projectId}/crew`);
  }

  add(projectId: string, role: string, name: string, contact: string, notes: string): Observable<CrewMember> {
    return this.http.post<CrewMember>(`${this.BASE}/projects/${projectId}/crew`, { role, name, contact, notes });
  }

  update(projectId: string, memberId: string, role: string, name: string, contact: string, notes: string): Observable<CrewMember> {
    return this.http.put<CrewMember>(`${this.BASE}/projects/${projectId}/crew/${memberId}`, { role, name, contact, notes });
  }

  remove(projectId: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/crew/${memberId}`);
  }
}
