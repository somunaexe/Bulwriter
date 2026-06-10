import { Component } from '@angular/core';
import { EditorComponent } from './components/editor/editor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [EditorComponent],
  template: `<app-editor projectId="demo-project" scriptId="demo-script" />`,
})
export class AppComponent {}
