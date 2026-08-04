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

  // Set from projectService.get()'s error path (a real 404, unlike
  // getMyRole's 403 — which can't tell "doesn't exist" apart from
  // "exists but you're not a member") — see the template for how this
  // takes priority over the normal dashboard content.
  projectNotFound = false;
  private projectSettled = false;
  private scriptsSettled = false;

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

    this.projectService.get(this.projectId).subscribe({
      next: p => {
        this.project = p;
        this.projectSettled = true;
        this.checkLoaded();
      },
      error: () => {
        this.projectNotFound = true;
        this.projectSettled = true;
        this.checkLoaded();
      },
    });

    this.scriptService.list(this.projectId).subscribe({
      next: scripts => {
        this.scripts = scripts ?? [];
        this.scriptsSettled = true;
        this.checkLoaded();
      },
      error: err => {
        this.error = 'Could not load scripts.';
        this.scriptsSettled = true;
        this.checkLoaded();
      },
    });

    // Fetch role
    this.membershipService.getMyRole(this.projectId).subscribe({
      next: ({ role }) => {
        this.myRole = role;
      },
    });
  }

  // Both requests race independently — wait for both to settle before
  // dropping the loading state, so the page never flickers through "No
  // scripts yet" for a project that turns out not to exist a moment later.
  private checkLoaded(): void {
    if (this.projectSettled && this.scriptsSettled) this.loading = false;
  }

  goHome(): void {
    this.router.navigate(['/']);
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

  openTrash(): void {
    this.router.navigate(['/projects', this.projectId, 'trash']);
  }

  // Only editors and owners can delete scripts — same bar as creating one.
  deleteScript(event: Event, s: Script): void {
    event.stopPropagation();
    this.scriptService.remove(this.projectId, s.id).subscribe({
      next: () => {
        this.scripts = this.scripts.filter(x => x.id !== s.id);
      },
      error: () => {
        this.error = 'Could not delete script.';
      },
    });
  }

  // ── Rename ───────────────────────────────────────────────────────

  showRenameProjectModal = false;
  renameProjectTitle = '';
  renameProjectError = '';

  openRenameProjectModal(): void {
    if (!this.project) return;
    this.renameProjectTitle = this.project.title;
    this.renameProjectError = '';
    this.showRenameProjectModal = true;
  }

  confirmRenameProject(): void {
    const title = this.renameProjectTitle.trim();
    if (!title || !this.project) return;

    this.projectService.rename(this.projectId, title).subscribe({
      next: () => {
        this.project!.title = title;
        this.showRenameProjectModal = false;
      },
      error: () => {
        this.renameProjectError = 'Could not rename project.';
      },
    });
  }

  renamingScript: Script | null = null;
  renameScriptTitle = '';
  renameScriptError = '';

  openRenameScript(event: Event, s: Script): void {
    event.stopPropagation();
    this.renamingScript = s;
    this.renameScriptTitle = s.title;
    this.renameScriptError = '';
  }

  confirmRenameScript(): void {
    const s = this.renamingScript;
    const title = this.renameScriptTitle.trim();
    if (!s || !title) return;

    this.scriptService.rename(this.projectId, s.id, title).subscribe({
      next: () => {
        s.title = title;
        this.renamingScript = null;
      },
      error: () => {
        this.renameScriptError = 'Could not rename script.';
      },
    });
  }
}
