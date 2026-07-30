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

// A shoot day's call-sheet fields — date, general crew call time,
// location, freeform notes. Keyed by dayNumber, same as ScheduleStrip.
export interface ScheduleDayMeta {
  scriptId: string;
  dayNumber: number;
  shootDate: string;
  callTime: string;
  location: string;
  notes: string;
  dataBackedUp: boolean;
  dailiesReviewed: boolean;
  cameraReport: string;
  soundReport: string;
  wrapNotes: string;
  updatedAt: string;
}

export interface DayMetaInput {
  dayNumber: number;
  shootDate: string;
  callTime: string;
  location: string;
  notes: string;
  dataBackedUp: boolean;
  dailiesReviewed: boolean;
  cameraReport: string;
  soundReport: string;
  wrapNotes: string;
}

export interface ScheduleResponse {
  strips: ScheduleStrip[];
  days: ScheduleDayMeta[];
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, scriptId: string): Observable<ScheduleResponse> {
    return this.http.get<ScheduleResponse>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/schedule`
    );
  }

  replace(projectId: string, scriptId: string, strips: StripInput[], days: DayMetaInput[]): Observable<ScheduleResponse> {
    return this.http.put<ScheduleResponse>(
      `${this.BASE}/projects/${projectId}/scripts/${scriptId}/schedule`,
      { strips, days }
    );
  }
}
