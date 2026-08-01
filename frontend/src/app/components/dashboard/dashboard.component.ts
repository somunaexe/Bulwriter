import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService, Project } from '../../services/project.service';
import { MembershipService, MyInvite } from '../../services/membership.service';
import { ClerkService } from '../../services/clerk.service';
import { ModalComponent } from '../modal/modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  projects: Project[] = [];
  newTitle = '';
  loading = true;
  error = '';

  // Invites addressed to the signed-in user — shown so they can actively
  // accept or decline instead of being silently auto-joined on login.
  invites: MyInvite[] = [];
  invitesLoading = true;
  invitePending: Record<string, boolean> = {};

  currentUserId: string | null = null;

  constructor(
    private projectService: ProjectService,
    private membershipService: MembershipService,
    private clerk: ClerkService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.clerk.userId$.subscribe(id => this.currentUserId = id);

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

    this.membershipService.listMyInvites().subscribe({
      next: invites => {
        this.invites = invites ?? [];
        this.invitesLoading = false;
      },
      error: () => {
        this.invitesLoading = false;
      },
    });
  }

  acceptInvite(invite: MyInvite): void {
    this.invitePending[invite.id] = true;
    this.membershipService.acceptInvite(invite.id).subscribe({
      next: () => {
        this.invites = this.invites.filter(i => i.id !== invite.id);
        delete this.invitePending[invite.id];
        // The newly-joined project won't be in the list yet — reload it
        // rather than trying to reconstruct a Project from the invite.
        this.projectService.list().subscribe(projects => this.projects = projects ?? []);
      },
      error: () => {
        delete this.invitePending[invite.id];
      },
    });
  }

  declineInvite(invite: MyInvite): void {
    this.invitePending[invite.id] = true;
    this.membershipService.declineInvite(invite.id).subscribe({
      next: () => {
        this.invites = this.invites.filter(i => i.id !== invite.id);
        delete this.invitePending[invite.id];
      },
      error: () => {
        delete this.invitePending[invite.id];
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

  isOwnerOf(p: Project): boolean {
    return !!this.currentUserId && p.ownerId === this.currentUserId;
  }

  // Only the owner can delete a project — the backend enforces this too,
  // this just keeps the button from showing where it'd just 403.
  deleteProject(event: Event, p: Project): void {
    event.stopPropagation();
    this.projectService.remove(p.id).subscribe({
      next: () => {
        this.projects = this.projects.filter(x => x.id !== p.id);
      },
      error: () => {
        this.error = 'Could not delete project.';
      },
    });
  }

  openTrash(): void {
    this.router.navigate(['/trash']);
  }

  // ── Rename ───────────────────────────────────────────────────────
  // The backend allows any editor-or-above to rename, but the dashboard
  // only knows ownerId (not each project's role) without an extra call
  // per card — same simplification the delete button already makes.

  renamingProject: Project | null = null;
  renameTitle = '';
  renameError = '';

  openRenameProject(event: Event, p: Project): void {
    event.stopPropagation();
    this.renamingProject = p;
    this.renameTitle = p.title;
    this.renameError = '';
  }

  confirmRename(): void {
    const p = this.renamingProject;
    const title = this.renameTitle.trim();
    if (!p || !title) return;

    this.projectService.rename(p.id, title).subscribe({
      next: () => {
        p.title = title;
        this.renamingProject = null;
      },
      error: () => {
        this.renameError = 'Could not rename project.';
      },
    });
  }
}