import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Shot {
  id: string;
  scriptId: string;
  sceneKey: string;
  shotType: string;
  description: string;
  image: string;
  position: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ShotListService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<Shot[]> {
    return this.http.get<Shot[]>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/shots`);
  }

  add(projectId: string, scriptId: string, sceneKey: string, shotType: string, description: string, image: string): Observable<Shot> {
    return this.http.post<Shot>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/shots`,
      { sceneKey, shotType, description, image }
    );
  }

  update(projectId: string, scriptId: string, shotId: string, shotType: string, description: string, image: string): Observable<Shot> {
    return this.http.put<Shot>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/shots/${shotId}`,
      { shotType, description, image }
    );
  }

  remove(projectId: string, scriptId: string, shotId: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE}/projects/${projectId}/scripts/${scriptId}/shots/${shotId}`);
  }
}
