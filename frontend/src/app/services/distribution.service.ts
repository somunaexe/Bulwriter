import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type FestivalStatus = 'planned' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn';

export interface FestivalSubmission {
  id: string;
  scriptId: string;
  festivalName: string;
  deadline: string;
  fee: number;
  status: FestivalStatus;
  premiereRequired: boolean;
  notes: string;
  position: number;
  createdAt: string;
}

export interface ReleaseLink {
  id: string;
  scriptId: string;
  platform: string;
  url: string;
  releaseDate: string;
  notes: string;
  position: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class DistributionService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Festival submissions ──────────────────────────────────────────

  listFestivals(projectId: string, scriptId: string): Observable<FestivalSubmission[]> {
    return this.http.get<FestivalSubmission[]>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/festivals`);
  }

  addFestival(
    projectId: string, scriptId: string, festivalName: string, deadline: string,
    fee: number, status: FestivalStatus, premiereRequired: boolean, notes: string,
  ): Observable<FestivalSubmission> {
    return this.http.post<FestivalSubmission>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/festivals`,
      { festivalName, deadline, fee, status, premiereRequired, notes }
    );
  }

  updateFestival(
    projectId: string, scriptId: string, festivalId: string, festivalName: string, deadline: string,
    fee: number, status: FestivalStatus, premiereRequired: boolean, notes: string,
  ): Observable<FestivalSubmission> {
    return this.http.put<FestivalSubmission>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/festivals/${festivalId}`,
      { festivalName, deadline, fee, status, premiereRequired, notes }
    );
  }

  removeFestival(projectId: string, scriptId: string, festivalId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/festivals/${festivalId}`);
  }

  // ── Release links ────────────────────────────────────────────────

  listReleaseLinks(projectId: string, scriptId: string): Observable<ReleaseLink[]> {
    return this.http.get<ReleaseLink[]>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/release-links`);
  }

  addReleaseLink(
    projectId: string, scriptId: string, platform: string, url: string, releaseDate: string, notes: string,
  ): Observable<ReleaseLink> {
    return this.http.post<ReleaseLink>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/release-links`,
      { platform, url, releaseDate, notes }
    );
  }

  updateReleaseLink(
    projectId: string, scriptId: string, linkId: string, platform: string, url: string, releaseDate: string, notes: string,
  ): Observable<ReleaseLink> {
    return this.http.put<ReleaseLink>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/release-links/${linkId}`,
      { platform, url, releaseDate, notes }
    );
  }

  removeReleaseLink(projectId: string, scriptId: string, linkId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/release-links/${linkId}`);
  }
}
