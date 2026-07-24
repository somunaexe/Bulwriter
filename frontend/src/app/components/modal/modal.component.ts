import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Generic centered modal — backdrop + panel, closes on backdrop click or
 * Escape. Used in place of native alert()/prompt() wherever the app needs
 * to show or collect something (keyboard shortcuts, find & replace, the
 * PDF export password prompt, word count / script statistics).
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
})
export class ModalComponent {
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
