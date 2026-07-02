import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScriptService, Script } from '../../services/script.service';
import { MembershipService, Member, Invite } from '../../services/membership.service';

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
  members: Member[] = [];
  invites: Invite[] = [];
  inviteEmail = '';
  inviteError = '';
  myRole = '';

  constructor(
      private scriptService: ScriptService,
      private membershipService: MembershipService,
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
        this.error = 'Could not load scripts.';
        this.loading = false;
      },
    });
    
    // Load collaborators
    this.loadCollaborators();
    
    // Fetch role
    this.membershipService.getMyRole(this.projectId).subscribe({
      next: ({ role }) => this.myRole = role,
    });
  }

  get isOwner(): boolean { return this.myRole === 'owner'; }
  get canEdit(): boolean { return this.myRole === 'owner' || this.myRole === 'editor'; }

  loadCollaborators(): void {
    this.membershipService.listMembers(this.projectId).subscribe(m => this.members = m ?? []);
    this.membershipService.listInvites(this.projectId).subscribe(i => this.invites = i ?? []);
  }

  sendInvite(): void {
    const email = this.inviteEmail.trim();
    if (!email) return;

    this.membershipService.invite(this.projectId, email).subscribe({
      next: invite => {
        this.invites.unshift(invite);
        this.inviteEmail = '';
        this.inviteError = '';
      },
      error: () => {
        this.inviteError = 'Could not send invite.';
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
