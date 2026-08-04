import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectService, Project } from '../../services/project.service';
import { ScriptService, Script } from '../../services/script.service';
import { ModalComponent } from '../modal/modal.component';

const RETENTION_DAYS = 30;

// Shared trash view for both routes: /trash (deleted projects) and
// /projects/:projectId/trash (deleted scripts within that project) — same
// list/restore shape either way, distinguished by whether projectId is
// present in the route.
@Component({
  selector: 'app-trash',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
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

  // Only meaningful for the project-scoped route. listTrash never checks
  // the project exists (it just returns an empty list), so
  // projectService.get()'s error path is the only real existence signal —
  // same pattern as ProjectComponent/EditorComponent/StoryComponent.
  projectNotFound = false;
  private projectSettled = false;
  private trashSettled = false;

  constructor(
    private projectService: ProjectService,
    private scriptService: ScriptService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.projectId = this.route.snapshot.params['projectId'] ?? null;

    if (this.projectId) {
      this.projectService.get(this.projectId).subscribe({
        next: () => { this.projectSettled = true; this.checkLoaded(); },
        error: () => {
          this.projectNotFound = true;
          this.projectSettled = true;
          this.checkLoaded();
        },
      });

      this.scriptService.listTrash(this.projectId).subscribe({
        next: scripts => {
          this.scripts = scripts ?? [];
          this.trashSettled = true;
          this.checkLoaded();
        },
        error: () => {
          this.error = 'Could not load trash.';
          this.trashSettled = true;
          this.checkLoaded();
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

  private checkLoaded(): void {
    if (this.projectSettled && this.trashSettled) this.loading = false;
  }

  goHome(): void {
    this.router.navigate(['/']);
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

  // ── Delete forever ───────────────────────────────────────────────
  // Skips the rest of the 30-day retention window — irreversible, so it
  // requires typing the exact title before it's allowed through.

  confirmingDelete: { kind: 'project' | 'script'; id: string; title: string } | null = null;
  confirmDeleteText = '';
  confirmDeleteError = '';

  openConfirmDeleteProject(p: Project): void {
    this.confirmingDelete = { kind: 'project', id: p.id, title: p.title };
    this.confirmDeleteText = '';
    this.confirmDeleteError = '';
  }

  openConfirmDeleteScript(s: Script): void {
    this.confirmingDelete = { kind: 'script', id: s.id, title: s.title };
    this.confirmDeleteText = '';
    this.confirmDeleteError = '';
  }

  get confirmDeleteMatches(): boolean {
    return !!this.confirmingDelete && this.confirmDeleteText === this.confirmingDelete.title;
  }

  confirmPermanentDelete(): void {
    const target = this.confirmingDelete;
    if (!target || !this.confirmDeleteMatches) return;

    const request = target.kind === 'project'
      ? this.projectService.purgeNow(target.id)
      : this.scriptService.purgeNow(this.projectId!, target.id);

    request.subscribe({
      next: () => {
        if (target.kind === 'project') {
          this.projects = this.projects.filter(x => x.id !== target.id);
        } else {
          this.scripts = this.scripts.filter(x => x.id !== target.id);
        }
        this.confirmingDelete = null;
      },
      error: () => {
        this.confirmDeleteError = 'Could not delete permanently.';
      },
    });
  }
}
