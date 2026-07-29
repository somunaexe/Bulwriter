import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StoryService, StoryBible, IdeaNote, StoryScriptRow } from '../../services/story.service';
import { ProjectService, Project } from '../../services/project.service';
import { MembershipService } from '../../services/membership.service';

@Component({
  selector: 'app-story',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './story.component.html',
  styleUrl: './story.component.scss',
})
export class StoryComponent implements OnInit {
  projectId = '';
  project: Project | null = null;
  loading = true;
  myRole = '';

  bible: StoryBible | null = null;
  ideaNotes: IdeaNote[] = [];
  scripts: StoryScriptRow[] = [];

  newNoteText = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private storyService: StoryService,
    private projectService: ProjectService,
    private membershipService: MembershipService,
  ) {}

  ngOnInit(): void {
    this.projectId = this.route.snapshot.params['projectId'];

    this.projectService.get(this.projectId).subscribe(p => this.project = p);

    this.membershipService.getMyRole(this.projectId).subscribe({
      next: ({ role }) => this.myRole = role,
    });

    this.storyService.get(this.projectId).subscribe({
      next: res => {
        this.bible = res.bible;
        this.ideaNotes = res.ideaNotes;
        this.scripts = res.scripts;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  get canEdit(): boolean { return this.myRole === 'owner' || this.myRole === 'editor'; }

  saveBible(): void {
    if (!this.canEdit || !this.bible) return;
    this.storyService.setBible(this.projectId, {
      coreQuestion: this.bible.coreQuestion,
      genre: this.bible.genre,
      tone: this.bible.tone,
      theme: this.bible.theme,
    }).subscribe();
  }

  addNote(): void {
    const text = this.newNoteText.trim();
    if (!text || !this.canEdit) return;
    this.storyService.addIdeaNote(this.projectId, text).subscribe(note => {
      this.ideaNotes.push(note);
      this.newNoteText = '';
    });
  }

  removeNote(note: IdeaNote): void {
    if (!this.canEdit) return;
    this.ideaNotes = this.ideaNotes.filter(n => n.id !== note.id);
    this.storyService.removeIdeaNote(this.projectId, note.id).subscribe();
  }

  saveScriptStory(row: StoryScriptRow): void {
    if (!this.canEdit) return;
    this.storyService.setScriptStory(this.projectId, row.scriptId, row.logline, row.synopsis).subscribe();
  }

  openScript(scriptId: string): void {
    this.router.navigate(['/projects', this.projectId, 'scripts', scriptId]);
  }

  backToProject(): void {
    this.router.navigate(['/projects', this.projectId]);
  }
}
