import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ClerkService } from '../services/clerk.service';
import { filter, map, switchMap, take } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const clerk = inject(ClerkService);
  const router = inject(Router);

  return clerk.ready$.pipe(
    filter(ready => ready),
    take(1),
    switchMap(() => clerk.isSignedIn$.pipe(
      take(1),
      map(isSignedIn => {
        if (isSignedIn) return true;
        return router.createUrlTree(['/sign-in']);
      })
    ))
  );
};