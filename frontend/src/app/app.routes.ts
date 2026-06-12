import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { EditorComponent } from './components/editor/editor.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
  },
  {
    path: 'project/:projectId/script/:scriptId',
    component: EditorComponent,
  },
  {
    // Redirect anything unknown back to the dashboard
    path: '**',
    redirectTo: '',
  },
];