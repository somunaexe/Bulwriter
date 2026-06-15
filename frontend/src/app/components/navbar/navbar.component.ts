import { Component, inject, OnInit } from '@angular/core';
import { ClerkService } from '../../services/clerk.service';
import { BehaviorSubject, filter, map, switchMap, take } from 'rxjs';
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

  constructor(
    private router: Router
  ) {}

  ngOnInit(): void {
    this.signedIn$ = this.clerk.isSignedIn$;
  }

  signOut(): void {
    if (this.signedIn$) this.clerk?.signOut();
  }

  signIn(): void {
    this.router.navigate(['/']);
  }
}
