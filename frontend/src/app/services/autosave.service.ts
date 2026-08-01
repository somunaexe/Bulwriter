import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AutoSaveInterval = 1 | 2 | 5 | 10; // minutes

export interface AutoSaveState {
  enabled: boolean;
  intervalMinutes: AutoSaveInterval;
  lastSaved: Date | null;
  saving: boolean;
  // Whether the document has changed since the last successful save —
  // drives the "you have unsaved changes" warning on tab close/navigation
  // (see EditorComponent's beforeunload handler and unsaved-changes.guard).
  dirty: boolean;
}

@Injectable({ providedIn: 'root' })
export class AutoSaveService implements OnDestroy {
  // BehaviorSubject so the UI can reactively show the current state
  state$ = new BehaviorSubject<AutoSaveState>({
    enabled: true,
    intervalMinutes: 2,
    lastSaved: null,
    saving: false,
    dirty: false,
  });

  private timer: any = null;

  // The callback that actually does the saving — set by the editor
  // component when it mounts. This keeps the service decoupled from
  // the editor: it doesn't need to know HOW to save, just WHEN.
  private saveFn: (() => Promise<void>) | null = null;

  setSaveFn(fn: () => Promise<void>): void {
    this.saveFn = fn;
  }

  start(): void {
    this.stop(); // clear any existing timer first
    const state = this.state$.getValue();
    if (!state.enabled) return;

    const intervalMs = state.intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => this.triggerSave(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async triggerSave(): Promise<void> {
    if (!this.saveFn) return;

    this.state$.next({ ...this.state$.getValue(), saving: true });

    try {
      await this.saveFn();
      this.state$.next({
        ...this.state$.getValue(),
        saving: false,
        lastSaved: new Date(),
        dirty: false,
      });
    } catch (err) {
      this.state$.next({ ...this.state$.getValue(), saving: false });
      console.error('Auto-save failed:', err);
    }
  }

  // For saves that happen outside the timer (e.g. committing a named
  // snapshot) — lets the sidebar's "Saved HH:mm" indicator reflect any
  // manual save, not just automatic ticks.
  markSaved(): void {
    this.state$.next({ ...this.state$.getValue(), saving: false, lastSaved: new Date(), dirty: false });
  }

  // Called whenever the document actually changes (see SyncService's
  // contentChanged$) — flips the flag the unsaved-changes warning checks.
  markDirty(): void {
    if (this.state$.getValue().dirty) return; // already flagged, skip the redundant emit
    this.state$.next({ ...this.state$.getValue(), dirty: true });
  }

  setEnabled(enabled: boolean): void {
    this.state$.next({ ...this.state$.getValue(), enabled });
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  setInterval(intervalMinutes: AutoSaveInterval): void {
    this.state$.next({ ...this.state$.getValue(), intervalMinutes });
    // Restart the timer with the new interval
    if (this.state$.getValue().enabled) {
      this.start();
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }
}