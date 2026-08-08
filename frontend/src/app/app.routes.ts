import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { EditorComponent } from './components/editor/editor.component';
import { ProjectComponent } from './components/project/project.component';
import { StoryComponent } from './components/story/story.component';
import { TrashComponent } from './components/trash/trash.component';
import { authGuard } from './guard/auth.guard';
import { unsavedChangesGuard } from './guard/unsaved-changes.guard';
import { SignInComponent } from './components/sign-in/sign-in.component';
import { DonateComponent } from './components/donate/donate.component';

export const routes: Routes = [
  {
    path: 'sign-in',
    component: SignInComponent,
  },
  {
    // Public — no authGuard. Anyone should be able to support the project
    // without a Bulwriter account.
    path: 'donate',
    component: DonateComponent,
  },
  {
    path: '',
    component: DashboardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'trash',
    component: TrashComponent,
    canActivate: [authGuard],
  },
  {
    path: 'projects/:projectId',
    component: ProjectComponent,
    canActivate: [authGuard],
  },
  {
    path: 'projects/:projectId/story',
    component: StoryComponent,
    canActivate: [authGuard],
  },
  {
    path: 'projects/:projectId/trash',
    component: TrashComponent,
    canActivate: [authGuard],
  },
  {
    path: 'projects/:projectId/scripts/:scriptId',
    component: EditorComponent,
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
  },
  {
    // Redirect anything unknown back to the dashboard
    path: '**',
    redirectTo: '',
  },
];
