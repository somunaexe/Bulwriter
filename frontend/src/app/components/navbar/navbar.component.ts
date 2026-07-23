import { Component, ElementRef, HostListener, inject, OnInit } from '@angular/core';
import { ClerkService } from '../../services/clerk.service';
import { CurrentRoleService } from '../../services/current-role.service';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})

export class NavbarComponent implements OnInit {
  clerk = inject(ClerkService);
  currentRole = inject(CurrentRoleService);

  signedIn$ = this.clerk.isSignedIn$;
  user$ = this.clerk.user$;
  role$ = this.currentRole.role$;

  menuOpen = false;
  accountOpen = false;
  aboutOpen = false;

  constructor(
    private router: Router,
    private host: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {}

  async signOut(): Promise<void> {
    await this.clerk.signOut();
    this.accountOpen = false;
    this.router.navigate(['sign-in']);
  }

  openAccount(): void {
    this.accountOpen = false;
    this.clerk.openUserProfile();
  }

  openProjects(): void {
    this.menuOpen = false;
    this.router.navigate(['/']);
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  toggleAccount(): void {
    this.accountOpen = !this.accountOpen;
  }

  toggleAbout(): void {
    this.aboutOpen = !this.aboutOpen;
    this.accountOpen = false;
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || '?';
  }

  // Close the account dropdown when clicking anywhere outside it.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.accountOpen && !this.host.nativeElement.contains(event.target as Node)) {
      this.accountOpen = false;
    }
  }
}
