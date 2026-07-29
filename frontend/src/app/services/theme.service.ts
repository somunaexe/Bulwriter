import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'bulwriter:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // index.html has already applied the stored theme (or the light
  // default) to <html data-theme> before Angular even bootstraps, so
  // this just reads that same attribute back rather than re-deciding it —
  // one source of truth, no flash of the wrong theme on load.
  theme$ = new BehaviorSubject<Theme>(
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  );

  get theme(): Theme {
    return this.theme$.getValue();
  }

  toggle(): void {
    this.set(this.theme === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.theme$.next(theme);
  }
}
