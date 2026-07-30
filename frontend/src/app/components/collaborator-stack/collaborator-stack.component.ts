import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MembershipService } from '../../services/membership.service';
import { CrewService } from '../../services/crew.service';

interface Collaborator {
  key: string;
  name: string;
  contact: string;
  role: string;
  notes: string;
  imageUrl: string | null;
  accepted: boolean;
}

/**
 * Overlapping avatar stack — one circle per entry, tapping one opens a
 * small detail popover. Originally built for project collaborators
 * (photo if Clerk has one, initials otherwise; a dashed outline for a
 * still-pending invite, since it has no Clerk account yet) and reused
 * as-is for the production crew list (`mode="crew"`) — same stack/
 * popover UI, backed by CrewService instead of MembershipService, with
 * a role/name/contact add form and a remove action in place of the
 * email invite flow.
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
  @Input() mode: 'collaborators' | 'crew' = 'collaborators';
  // Only an owner can invite/remove collaborators, or an owner/editor
  // add/remove crew — the manage circle only shows up when true,
  // everyone else just sees who's on the list.
  @Input() canManage = false;
  // When true, clicking the manage ("+") avatar opens a small add form
  // right here (anchored below the stack) instead of emitting `manage` —
  // used on the editor page, where there's nowhere further to navigate
  // to, and always for crew (there's no separate "manage crew" page).
  // Collaborators on the project page (the manage page itself) leave
  // this off and handle `manage` themselves.
  @Input() invitePopover = false;
  @Output() manage = new EventEmitter<void>();

  collaborators: Collaborator[] = [];
  openKey: string | null = null;

  showInvitePopover = false;
  inviteEmail = '';
  inviteError = '';
  inviteSending = false;

  newCrewRole = '';
  newCrewName = '';
  newCrewContact = '';

  private memberCollabs: Collaborator[] = [];
  private pendingCollabs: Collaborator[] = [];

  constructor(
    private membership: MembershipService,
    private crew: CrewService,
    private host: ElementRef<HTMLElement>,
  ) {}

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

    if (this.mode === 'crew') {
      this.crew.list(this.projectId).subscribe(members => {
        this.memberCollabs = (members ?? []).map(m => ({
          key: 'crew:' + m.id,
          name: m.name,
          contact: m.contact,
          role: m.role || 'Crew',
          notes: m.notes,
          imageUrl: null,
          accepted: true,
        }));
        this.pendingCollabs = [];
        this.combine();
      });
      return;
    }

    this.membership.listMembers(this.projectId).subscribe(members => {
      this.memberCollabs = (members ?? []).map(m => ({
        key: 'member:' + m.userId,
        name: m.name || m.email || 'Collaborator',
        contact: m.email || '',
        role: m.role,
        notes: '',
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
          contact: i.email,
          role: i.role,
          notes: '',
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
      this.newCrewRole = '';
      this.newCrewName = '';
      this.newCrewContact = '';
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

  addCrewMember(): void {
    const name = this.newCrewName.trim();
    if (!name) return;

    this.inviteSending = true;
    this.crew.add(this.projectId, this.newCrewRole.trim(), name, this.newCrewContact.trim(), '').subscribe({
      next: () => {
        this.inviteSending = false;
        this.showInvitePopover = false;
        this.newCrewRole = '';
        this.newCrewName = '';
        this.newCrewContact = '';
        this.load();
      },
      error: () => {
        this.inviteSending = false;
        this.inviteError = 'Could not add crew member.';
      },
    });
  }

  removeCrewMember(key: string): void {
    if (this.mode !== 'crew') return;
    const id = key.slice('crew:'.length);
    this.openKey = null;
    this.crew.remove(this.projectId, id).subscribe(() => this.load());
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      if (this.openKey) this.openKey = null;
      if (this.showInvitePopover) this.showInvitePopover = false;
    }
  }
}
