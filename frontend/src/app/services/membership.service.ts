import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Member {
  projectId: string;
  userId: string;
  role: string;
  joinedAt: string;
}

export interface Invite {
  id: string;
  projectId: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class MembershipService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  listMembers(projectId: string): Observable<Member[]> {
    return this.http.get<Member[]>(`${this.BASE}/projects/${projectId}/members`);
  }

  listInvites(projectId: string): Observable<Invite[]> {
    return this.http.get<Invite[]>(`${this.BASE}/projects/${projectId}/invites`);
  }

  invite(projectId: string, email: string, role: string = 'editor'): Observable<Invite> {
    return this.http.post<Invite>(`${this.BASE}/projects/${projectId}/invites`, { email, role });
  }

  getMyRole(projectId: string): Observable<{ role: string }> {
    return this.http.get<{ role: string }>(`${this.BASE}/projects/${projectId}/my-role`);
  }
}