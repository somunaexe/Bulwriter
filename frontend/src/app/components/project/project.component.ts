import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScriptService, Script } from '../../services/script.service';
import { MembershipService } from '../../services/membership.service';
import { ProjectService, Project } from '../../services/project.service';
import { CollaboratorStackComponent } from '../collaborator-stack/collaborator-stack.component';
import { ModalComponent } from '../modal/modal.component';

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [CommonModule, FormsModule, CollaboratorStackComponent, ModalComponent],
  templateUrl: './project.component.html',
  styleUrl: './project.component.scss'
})
export class ProjectComponent implements OnInit {
  @ViewChild('collabStack') collabStack?: CollaboratorStackComponent;

  scripts: Script[] = [];
  project: Project | null = null;
  projectId = '';
  newTitle = '';
  loading = true;
  error = '';
  myRole = '';

  // Reused for the "Invite collaborator" modal, opened via the
  // collaborator stack's manage ("+") button — this replaced the
  // always-visible invite input that used to live directly in this page.
  showInviteModal = false;
  inviteEmail = '';
  inviteError = '';

  constructor(
      private scriptService: ScriptService,
      private membershipService: MembershipService,
      private projectService: ProjectService,
      private route: ActivatedRoute,
      private router: Router
    ) {}

  ngOnInit(): void {
    this.projectId = this.route.snapshot.params['projectId'];

    this.projectService.get(this.projectId).subscribe(p => this.project = p);

    this.scriptService.list(this.projectId).subscribe({
      next: scripts => {
        this.scripts = scripts ?? [];
        this.loading = false;
      },
      error: err => {
        this.error = 'Could not load scripts.';
        this.loading = false;
      },
    });

    // Fetch role
    this.membershipService.getMyRole(this.projectId).subscribe({
      next: ({ role }) => {
        this.myRole = role;
      },
    });
  }

  get isOwner(): boolean { return this.myRole === 'owner'; }
  get canEdit(): boolean { return this.myRole === 'owner' || this.myRole === 'editor'; }

  openInviteModal(): void {
    this.inviteEmail = '';
    this.inviteError = '';
    this.showInviteModal = true;
  }

  sendInvite(): void {
    const email = this.inviteEmail.trim();
    if (!email) return;

    this.membershipService.invite(this.projectId, email).subscribe({
      next: () => {
        this.inviteEmail = '';
        this.inviteError = '';
        this.showInviteModal = false;
        this.collabStack?.refresh();
      },
      error: (err) => {
        this.inviteError = err?.error?.error || 'Could not send invite.';
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

  openStory(): void {
    this.router.navigate(['/projects', this.projectId, 'story']);
  }
}
