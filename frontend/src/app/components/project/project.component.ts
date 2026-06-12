import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScriptService, Script } from '../../services/script.service';

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project.component.html',
  styleUrl: './project.component.scss'
})
export class ProjectComponent implements OnInit{
  scripts: Script[] = [];
  projectId = '';
  newTitle = '';
  loading = true;
  error = '';

  constructor(
      private scriptService: ScriptService,
      private route: ActivatedRoute,
      private router: Router
    ) {}

  ngOnInit(): void {
    this.projectId = this.route.snapshot.params['projectId'];

    this.scriptService.list(this.projectId).subscribe({
      next: scripts => {
        this.scripts = scripts ?? [];
        this.loading = false;
      },
      error: err => {
        this.error = 'Could not load projects.';
        this.loading = false;
      },
    });
  }

  createScript(): void {
    if (!this.newTitle.trim()) return;

    this.scriptService.create(this.projectId, this.newTitle.trim()).subscribe({
      next: script => {
        // Instead of re-fetching the whole list, just push the
        // new script onto the existing array.
        this.scripts.unshift(script);
        this.newTitle = '';
      },
      error: () => {
        this.error = 'Could not create project.';
      },
    });
  }

  openScript(id: string): void {
    this.router.navigate(['/projects', this.projectId, 'scripts', id]);
  }
}
