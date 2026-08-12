import { ApplicationConfig, ErrorHandler } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import * as Sentry from '@sentry/angular';
import { authInterceptor } from './interceptors/auth.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Reports uncaught errors to Sentry. Harmless to provide unconditionally
    // — it's a no-op until Sentry.init() actually runs (see main.ts), which
    // only happens when environment.sentryDsn is set.
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler() },
  ],
};