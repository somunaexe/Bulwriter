import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService, Project } from '../../services/project.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  projects: Project[] = [];
  newTitle = '';
  loading = true;
  error = '';

  constructor(
    private projectService: ProjectService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.projectService.list().subscribe({
      next: projects => {
        this.projects = projects ?? [];
        this.loading = false;
      },
      error: err => {
        this.error = 'Could not load projects.';
        this.loading = false;
      },
    });
  }

  createProject(): void {
    if (!this.newTitle.trim()) return;

    this.projectService.create(this.newTitle.trim()).subscribe({
      next: project => {
        // Instead of re-fetching the whole list, just push the
        // new project onto the existing array.
        this.projects.unshift(project);
        this.newTitle = '';
      },
      error: () => {
        this.error = 'Could not create project.';
      },
    });
  }

  openProject(id: string): void {
    this.router.navigate(['/projects', id]);
  }
}