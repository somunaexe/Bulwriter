import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SceneBreakdownTag {
  id: string;
  scriptId: string;
  sceneKey: string;
  props: string[];
  notes: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class SceneBreakdownService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<SceneBreakdownTag[]> {
    return this.http.get<SceneBreakdownTag[]>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/breakdown`
    );
  }

  upsert(projectId: string, scriptId: string, sceneKey: string, props: string[], notes: string): Observable<SceneBreakdownTag> {
    return this.http.put<SceneBreakdownTag>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/breakdown`,
      { sceneKey, props, notes }
    );
  }
}
