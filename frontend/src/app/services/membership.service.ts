import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Member {
  projectId: string;
  userId: string;
  role: string;
  joinedAt: string;
  // Enriched server-side from Clerk (see backend/internal/clerkapi) —
  // absent if CLERK_SECRET_KEY isn't configured or Clerk has no record
  // of the user, so treat these as optional everywhere they're used.
  name?: string;
  email?: string;
  imageUrl?: string;
}

export interface Invite {
  id: string;
  projectId: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

// An invite addressed to the signed-in user, enriched with the project's
// title (see api.listMyInvites) so it can be shown/accepted/declined
// without a separate per-project lookup.
export interface MyInvite extends Invite {
  projectTitle?: string;
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

  // Invites addressed to the signed-in user, across all projects — they
  // decide whether to accept or decline, rather than invites being
  // silently auto-accepted on next login.
  listMyInvites(): Observable<MyInvite[]> {
    return this.http.get<MyInvite[]>(`${this.BASE}/invites/mine`);
  }

  acceptInvite(inviteId: string): Observable<Invite> {
    return this.http.post<Invite>(`${this.BASE}/invites/${inviteId}/accept`, {});
  }

  declineInvite(inviteId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.BASE}/invites/${inviteId}/decline`, {});
  }
}