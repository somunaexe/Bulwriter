import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Credits {
  scriptId: string;
  additionalCredits: string;
  updatedAt: string;
}

export interface CreditsCastRow {
  characterName: string;
  actorName: string;
}

export interface CreditsCrewRow {
  name: string;
  role: string;
}

export interface CreditsResponse {
  credits: Credits;
  cast: CreditsCastRow[];
  crew: CreditsCrewRow[];
}

@Injectable({ providedIn: 'root' })
export class CreditsService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get(projectId: string, scriptId: string): Observable<CreditsResponse> {
    return this.http.get<CreditsResponse>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/credits`);
  }

  set(projectId: string, scriptId: string, additionalCredits: string): Observable<Credits> {
    return this.http.put<Credits>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/credits`,
      { additionalCredits }
    );
  }
}
