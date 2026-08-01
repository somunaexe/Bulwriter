import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService, Project } from '../../services/project.service';
import { ScriptService, Script } from '../../services/script.service';

const RETENTION_DAYS = 30;

// Shared trash view for both routes: /trash (deleted projects) and
// /projects/:projectId/trash (deleted scripts within that project) — same
// list/restore shape either way, distinguished by whether projectId is
// present in the route.
@Component({
  selector: 'app-trash',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trash.component.html',
  styleUrl: './trash.component.scss',
})
export class TrashComponent implements OnInit {
  projectId: string | null = null;

  projects: Project[] = [];
  scripts: Script[] = [];
  loading = true;
  error = '';
  restoring: Record<string, boolean> = {};

  constructor(
    private projectService: ProjectService,
    private scriptService: ScriptService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.projectId = this.route.snapshot.params['projectId'] ?? null;

    if (this.projectId) {
      this.scriptService.listTrash(this.projectId).subscribe({
        next: scripts => {
          this.scripts = scripts ?? [];
          this.loading = false;
        },
        error: () => {
          this.error = 'Could not load trash.';
          this.loading = false;
        },
      });
    } else {
      this.projectService.listTrash().subscribe({
        next: projects => {
          this.projects = projects ?? [];
          this.loading = false;
        },
        error: () => {
          this.error = 'Could not load trash.';
          this.loading = false;
        },
      });
    }
  }

  get isProjectTrash(): boolean {
    return this.projectId !== null;
  }

  // Whole days left before the periodic purge job discards this item for
  // good — mirrors the backend's RetentionPeriod (see internal/trash).
  daysLeft(deletedAt?: string): number {
    if (!deletedAt) return RETENTION_DAYS;
    const elapsedMs = Date.now() - new Date(deletedAt).getTime();
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(RETENTION_DAYS - elapsedDays));
  }

  restoreProject(p: Project): void {
    this.restoring[p.id] = true;
    this.projectService.restore(p.id).subscribe({
      next: () => {
        this.projects = this.projects.filter(x => x.id !== p.id);
        delete this.restoring[p.id];
      },
      error: () => {
        delete this.restoring[p.id];
      },
    });
  }

  restoreScript(s: Script): void {
    if (!this.projectId) return;
    this.restoring[s.id] = true;
    this.scriptService.restore(this.projectId, s.id).subscribe({
      next: () => {
        this.scripts = this.scripts.filter(x => x.id !== s.id);
        delete this.restoring[s.id];
      },
      error: () => {
        delete this.restoring[s.id];
      },
    });
  }

  back(): void {
    if (this.projectId) {
      this.router.navigate(['/projects', this.projectId]);
    } else {
      this.router.navigate(['/']);
    }
  }
}
