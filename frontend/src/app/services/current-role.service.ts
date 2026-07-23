import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * The current user's role (owner/editor/viewer) on whichever project is
 * currently open — set by ProjectComponent/EditorComponent, displayed by
 * NavbarComponent next to the user's name. They're siblings under
 * <app-root> (the navbar sits above <router-outlet>), so there's no
 * parent-child Input/Output path between them — this is the shared
 * channel instead.
 */
@Injectable({ providedIn: 'root' })
export class CurrentRoleService {
  role$ = new BehaviorSubject<string | null>(null);

  setRole(role: string | null): void {
    this.role$.next(role);
  }

  clear(): void {
    this.role$.next(null);
  }
}
