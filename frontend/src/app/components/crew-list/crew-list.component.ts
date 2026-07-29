import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CrewService, CrewMember } from '../../services/crew.service';

@Component({
  selector: 'app-crew-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crew-list.component.html',
  styleUrls: ['./crew-list.component.scss'],
})
export class CrewListComponent implements OnChanges {
  @Input() projectId = '';
  @Input() canEdit = false;

  loading = true;
  members: CrewMember[] = [];

  showAddForm = false;
  newRole = '';
  newName = '';
  newContact = '';

  constructor(private crewService: CrewService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId']) this.load();
  }

  private load(): void {
    if (!this.projectId) return;
    this.loading = true;
    this.crewService.list(this.projectId).subscribe({
      next: members => {
        this.members = members;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  save(member: CrewMember): void {
    if (!this.canEdit) return;
    this.crewService.update(this.projectId, member.id, member.role, member.name, member.contact, member.notes).subscribe();
  }

  remove(member: CrewMember): void {
    if (!this.canEdit) return;
    this.members = this.members.filter(m => m.id !== member.id);
    this.crewService.remove(this.projectId, member.id).subscribe();
  }

  addMember(): void {
    const name = this.newName.trim();
    if (!name) return;

    this.crewService.add(this.projectId, this.newRole.trim(), name, this.newContact.trim(), '').subscribe(member => {
      this.members.push(member);
      this.newRole = '';
      this.newName = '';
      this.newContact = '';
      this.showAddForm = false;
    });
  }
}
