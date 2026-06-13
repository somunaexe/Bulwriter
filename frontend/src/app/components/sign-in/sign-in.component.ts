import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ClerkService } from '../../services/clerk.service';
import { filter, take } from 'rxjs';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  template: `
    <div class="auth-page">
      <div #signInMount></div>
    </div>
  `,
  styles: [`
    .auth-page {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: var(--bg);
    }
  `]
})
export class SignInComponent implements OnInit {
  @ViewChild('signInMount', { static: true }) mountRef!: ElementRef<HTMLDivElement>;

  constructor(private clerk: ClerkService) {}

  ngOnInit(): void {
    // Wait for Clerk to finish loading before attempting to mount
    this.clerk.ready$.pipe(
      filter(ready => ready),
      take(1),
    ).subscribe(() => {
      this.clerk.mountSignIn(this.mountRef.nativeElement);
    });
  }
}