import { Component } from '@angular/core';
// import { EditorComponent } from './components/editor/editor.component';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  // imports: [EditorComponent],
  imports: [RouterOutlet],
  // template: `<app-editor projectId="demo-project" scriptId="demo-script" />`,
  template: `<router-outlet />`,
})
export class AppComponent {}
