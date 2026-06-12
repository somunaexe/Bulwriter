import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ClerkService {
  isSignedIn$ = new BehaviorSubject<boolean>(false);
  userId$ = new BehaviorSubject<string | null>(null);

  private clerk: any = null;

  async init(): Promise<void> {
    const clerkModule = await import('@clerk/clerk-js');
    const Clerk = clerkModule.Clerk ?? clerkModule.default;
    this.clerk = new Clerk(environment.clerkPublishableKey);
    await this.clerk.load();

    this.updateState();
    this.clerk.addListener(() => this.updateState());
  }

  private updateState(): void {
    const user = this.clerk?.user;
    this.isSignedIn$.next(!!user);
    this.userId$.next(user?.id ?? null);
  }

  async getToken(): Promise<string | null> {
    return this.clerk?.session?.getToken() ?? null;
  }

  openSignIn(): void {
    this.clerk?.openSignIn({});
  }

  openSignUp(): void {
    this.clerk?.openSignUp({});
  }

  signOut(): void {
    this.clerk?.signOut();
  }
}