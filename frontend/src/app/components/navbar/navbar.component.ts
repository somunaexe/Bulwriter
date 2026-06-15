import { Component, inject, OnInit } from '@angular/core';
import { ClerkService } from '../../services/clerk.service';
import { BehaviorSubject} from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})

export class NavbarComponent implements OnInit {
  clerk = inject(ClerkService)
  signedIn$ = new BehaviorSubject<boolean>(false);
  menuOpen: boolean = false;
  settingsOpen: boolean = false;

  constructor(
    private router: Router
  ) {}

  ngOnInit(): void {
    this.signedIn$ = this.clerk.isSignedIn$;
  }

  signOut(): void {
    this.signedIn$ = this.clerk.isSignedIn$;
    if (this.signedIn$) this.clerk?.signOut();
    if (!this.signedIn$) this.router.navigate(['sign-in']);
  }

  openProjects(): void {
    this.router.navigate(['/']);
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
  }
}
