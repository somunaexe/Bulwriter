import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

// Blocks in-app navigation away from a component with unsaved changes —
// EditorComponent's beforeunload handler covers an actual tab close/
// refresh, this covers everything else (clicking another link, the
// editor's own "Open project…"/"New script…", browser back/forward).
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges()) return true;
  return confirm('You have unsaved changes. Leave anyway?');
};
