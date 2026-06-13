import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { ClerkService } from '../services/clerk.service';

// An interceptor is just a function in modern Angular.
// It receives the request and a `next` handler — you either
// pass the request through unchanged, or modify it first then pass it on.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const clerk = inject(ClerkService);

  // getToken() is async, so we wrap it in from() to turn the
  // Promise into an Observable that switchMap can work with
  return from(clerk.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        // Not signed in — pass the request through unchanged
        return next(req);
      }

      // Clone the request and add the Authorization header.
      // We clone because HttpRequest objects are immutable —
      // you can't modify them directly, only create modified copies.
      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });

      return next(authReq);
    })
  );
};