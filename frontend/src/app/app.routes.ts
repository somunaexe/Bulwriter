import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { EditorComponent } from './components/editor/editor.component';
import { ProjectComponent } from './components/project/project.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
  },
  {
    path: 'projects/:projectId',
    component: ProjectComponent,
  },
  {
    path: 'projects/:projectId/scripts/:scriptId',
    component: EditorComponent,
  },
  {
    // Redirect anything unknown back to the dashboard
    path: '**',
    redirectTo: '',
  },
];