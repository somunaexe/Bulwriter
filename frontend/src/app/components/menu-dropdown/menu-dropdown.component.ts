import { Component, Input, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-menu-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './menu-dropdown.component.html',
  styleUrls: ['./menu-dropdown.component.scss'],
})
export class MenuDropdownComponent {
  @Input() label = '';

  open = false;

  toggle(): void {
    this.open = !this.open;
  }

  close(): void {
    this.open = false;
  }

  // @HostListener attaches an event listener to a global target —
  // here, every click anywhere in the document. We use this to
  // detect "click outside" and close the dropdown.
  //
  // We inject ElementRef to get a reference to this component's
  // own DOM element, so we can check whether the click happened
  // inside or outside of it.
  constructor(private elementRef: ElementRef) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }
}