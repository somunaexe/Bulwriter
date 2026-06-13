import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { EditorComponent } from './components/editor/editor.component';
import { ProjectComponent } from './components/project/project.component';
import { authGuard } from './guard/auth.guard';
import { SignInComponent } from './components/sign-in/sign-in.component';

export const routes: Routes = [
  {
    path: 'sign-in',
    component: SignInComponent,
  },
  {
    path: '',
    component: DashboardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'projects/:projectId',
    component: ProjectComponent,
    canActivate: [authGuard],
  },
  {
    path: 'projects/:projectId/scripts/:scriptId',
    component: EditorComponent,
    canActivate: [authGuard],
  },
  {
    // Redirect anything unknown back to the dashboard
    path: '**',
    redirectTo: '',
  },
];
