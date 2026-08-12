import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { ClerkService } from './app/services/clerk.service';
import { environment } from './environments/environment';

// Opt-in error tracking, same pattern as every other third-party
// credential in this app: unset just means it's off, not broken. Without
// this, a bug that only breaks for one user's browser is otherwise only
// visible if they happen to report it.
if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
  });
}

bootstrapApplication(AppComponent, appConfig).then(appRef => {
  const clerk = appRef.injector.get(ClerkService);

  // Don't await — let Angular render first, then Clerk loads in the background.
  // The ready$ BehaviorSubject will signal the guard when it's done.
  clerk.init().catch(console.error);
});