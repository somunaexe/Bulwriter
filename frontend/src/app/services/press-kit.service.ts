import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PressKit {
  scriptId: string;
  directorStatement: string;
  poster: string;
  posterFilename: string;
  updatedAt: string;
}

export interface Still {
  id: string;
  scriptId: string;
  image: string;
  imageFilename: string;
  caption: string;
  position: number;
  createdAt: string;
}

export interface PressKitCastRow {
  candidateId: string;
  characterName: string;
  actorName: string;
  bio: string;
}

export interface PressKitCrewRow {
  memberId: string;
  role: string;
  name: string;
  bio: string;
}

export interface PressKitResponse {
  pressKit: PressKit;
  stills: Still[];
  logline: string;
  synopsis: string;
  cast: PressKitCastRow[];
  crew: PressKitCrewRow[];
}

export type BioKind = 'cast' | 'crew';

@Injectable({ providedIn: 'root' })
export class PressKitService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get(projectId: string, scriptId: string): Observable<PressKitResponse> {
    return this.http.get<PressKitResponse>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/press-kit`);
  }

  set(projectId: string, scriptId: string, directorStatement: string, poster: string, posterFilename: string): Observable<PressKit> {
    return this.http.put<PressKit>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/press-kit`,
      { directorStatement, poster, posterFilename }
    );
  }

  addStill(projectId: string, scriptId: string, image: string, imageFilename: string, caption: string): Observable<Still> {
    return this.http.post<Still>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/press-kit/stills`,
      { image, imageFilename, caption }
    );
  }

  updateStill(projectId: string, scriptId: string, stillId: string, image: string, imageFilename: string, caption: string): Observable<Still> {
    return this.http.put<Still>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/press-kit/stills/${stillId}`,
      { image, imageFilename, caption }
    );
  }

  removeStill(projectId: string, scriptId: string, stillId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/press-kit/stills/${stillId}`);
  }

  setBio(projectId: string, scriptId: string, kind: BioKind, personId: string, bio: string): Observable<{ bio: string }> {
    return this.http.put<{ bio: string }>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/press-kit/bios/${kind}/${personId}`,
      { bio }
    );
  }
}
