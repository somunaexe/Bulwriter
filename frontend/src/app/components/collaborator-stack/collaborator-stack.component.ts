import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MembershipService } from '../../services/membership.service';

interface Collaborator {
  key: string;
  name: string;
  email: string;
  role: string;
  imageUrl: string | null;
  accepted: boolean;
}

/**
 * Overlapping avatar stack for the editor sidebar — one circle per
 * project member (photo if Clerk has one, initials otherwise) plus one
 * per still-pending invite (dashed outline, no photo, since they have no
 * Clerk account yet). Tapping an avatar opens a small popover with the
 * full detail: image, name, email, role, and accepted/pending status.
 */
@Component({
  selector: 'app-collaborator-stack',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './collaborator-stack.component.html',
  styleUrl: './collaborator-stack.component.scss',
})
export class CollaboratorStackComponent implements OnInit, OnChanges {
  @Input() projectId = '';
  // Only an owner can invite/remove people — the manage circle only
  // shows up for them, everyone else just sees who's on the project.
  @Input() canManage = false;
  // When true, clicking the manage ("+") avatar opens a small invite form
  // right here (anchored below the stack) instead of emitting `manage` —
  // used on the editor page, where there's nowhere further to navigate to.
  // The project page (the manage page itself) leaves this off and handles
  // `manage` itself.
  @Input() invitePopover = false;
  @Output() manage = new EventEmitter<void>();

  collaborators: Collaborator[] = [];
  openKey: string | null = null;

  showInvitePopover = false;
  inviteEmail = '';
  inviteError = '';
  inviteSending = false;

  private memberCollabs: Collaborator[] = [];
  private pendingCollabs: Collaborator[] = [];

  constructor(private membership: MembershipService, private host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && !changes['projectId'].firstChange) this.load();
  }

  // Called by a parent (e.g. after sending a new invite) to pick up
  // membership changes it made itself — this component only reloads on
  // its own when projectId changes.
  refresh(): void {
    this.load();
  }

  private load(): void {
    if (!this.projectId) return;

    this.membership.listMembers(this.projectId).subscribe(members => {
      this.memberCollabs = (members ?? []).map(m => ({
        key: 'member:' + m.userId,
        name: m.name || m.email || 'Collaborator',
        email: m.email || '',
        role: m.role,
        imageUrl: m.imageUrl || null,
        accepted: true,
      }));
      this.combine();
    });

    this.membership.listInvites(this.projectId).subscribe(invites => {
      this.pendingCollabs = (invites ?? [])
        .filter(i => i.status !== 'accepted')
        .map(i => ({
          key: 'invite:' + i.id,
          name: i.email,
          email: i.email,
          role: i.role,
          imageUrl: null,
          accepted: false,
        }));
      this.combine();
    });
  }

  // Members and invites resolve independently — merge into one list
  // instead of letting either subscribe callback overwrite the other.
  private combine(): void {
    this.collaborators = [...this.memberCollabs, ...this.pendingCollabs];
  }

  initials(name: string): string {
    return name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || '?';
  }

  toggle(key: string): void {
    this.openKey = this.openKey === key ? null : key;
    this.showInvitePopover = false;
  }

  onManageClick(): void {
    if (this.invitePopover) {
      this.openKey = null;
      this.inviteEmail = '';
      this.inviteError = '';
      this.showInvitePopover = !this.showInvitePopover;
    } else {
      this.manage.emit();
    }
  }

  sendInvite(): void {
    const email = this.inviteEmail.trim();
    if (!email) return;

    this.inviteSending = true;
    this.membership.invite(this.projectId, email).subscribe({
      next: () => {
        this.inviteSending = false;
        this.showInvitePopover = false;
        this.inviteEmail = '';
        this.load();
      },
      error: (err) => {
        this.inviteSending = false;
        this.inviteError = err?.error?.error || 'Could not send invite.';
      },
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      if (this.openKey) this.openKey = null;
      if (this.showInvitePopover) this.showInvitePopover = false;
    }
  }
}
