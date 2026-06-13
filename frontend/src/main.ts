import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { ClerkService } from './app/services/clerk.service';

bootstrapApplication(AppComponent, appConfig).then(appRef => {
  const clerk = appRef.injector.get(ClerkService);

  // Don't await — let Angular render first, then Clerk loads in the background.
  // The ready$ BehaviorSubject will signal the guard when it's done.
  clerk.init().catch(console.error);
});