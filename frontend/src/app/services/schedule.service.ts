import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ScheduleStrip {
  id: string;
  scriptId: string;
  sceneKey: string;
  dayNumber: number;
  position: number;
  updatedAt: string;
}

export interface StripInput {
  sceneKey: string;
  dayNumber: number;
  position: number;
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<ScheduleStrip[]> {
    return this.http.get<ScheduleStrip[]>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/schedule`
    );
  }

  replace(projectId: string, scriptId: string, strips: StripInput[]): Observable<ScheduleStrip[]> {
    return this.http.put<ScheduleStrip[]>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/schedule`,
      { strips }
    );
  }
}
