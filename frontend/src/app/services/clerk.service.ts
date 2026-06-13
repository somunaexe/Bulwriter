import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ClerkService {
  isSignedIn$ = new BehaviorSubject<boolean>(false);
  userId$ = new BehaviorSubject<string | null>(null);
  ready$ = new BehaviorSubject<boolean>(false);

  private clerk: any = null;
  private mountEl: HTMLElement | null = null;

  async init(): Promise<void> {
    this.clerk = (window as any).Clerk;

    await this.clerk.load({
        routerPush: (to: string) => window.location.href = to,
        routerReplace: (to: string) => window.location.href = to,
    });

    this.updateState();
    this.clerk.addListener(() => this.updateState());
    this.ready$.next(true);
  }

  private updateState(): void {
    const user = this.clerk?.user;
    this.isSignedIn$.next(!!user);
    this.userId$.next(user?.id ?? null);
  }

  async getToken(): Promise<string | null> {
    return this.clerk?.session?.getToken() ?? null;
  }

  setMountElement(el: HTMLElement): void {
    this.mountEl = el;
  }

  openSignIn(): void {
    if (this.mountEl) {
        console.log(this.mountEl)
        this.clerk?.mountSignIn(this.mountEl);
    } else {
        this.clerk?.openSignIn({});
    }
  }

  mountSignIn(el: HTMLElement): void {
    this.clerk?.mountSignIn(el);
  }

  openSignUp(): void {
    this.clerk?.openSignUp({});
  }

  signOut(): void {
    this.clerk?.signOut();
  }
}