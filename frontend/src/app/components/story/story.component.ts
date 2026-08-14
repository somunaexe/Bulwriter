import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StoryService, StoryBible, IdeaNote, StoryScriptRow, StoryBibleDraft } from '../../services/story.service';
import { ProjectService, Project } from '../../services/project.service';
import { MembershipService } from '../../services/membership.service';
import { ModalComponent } from '../modal/modal.component';
import { pickFile } from '../../editor/pick-file';
import { extractDocumentText } from '../../editor/document-text';

@Component({
  selector: 'app-story',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  templateUrl: './story.component.html',
  styleUrl: './story.component.scss',
})
export class StoryComponent implements OnInit {
  projectId = '';
  project: Project | null = null;
  loading = true;
  myRole = '';

  // Set from projectService.get()'s error path — a real 404, unlike
  // getStory/getMyRole, which both return 200/empty-ish results for a
  // project that doesn't exist (see checkLoaded below).
  projectNotFound = false;
  private projectSettled = false;
  private storySettled = false;

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

    this.projectService.get(this.projectId).subscribe({
      next: p => {
        this.project = p;
        this.projectSettled = true;
        this.checkLoaded();
      },
      error: () => {
        this.projectNotFound = true;
        this.projectSettled = true;
        this.checkLoaded();
      },
    });

    this.membershipService.getMyRole(this.projectId).subscribe({
      next: ({ role }) => this.myRole = role,
    });

    this.storyService.get(this.projectId).subscribe({
      next: res => {
        this.bible = res.bible;
        this.ideaNotes = res.ideaNotes;
        this.scripts = res.scripts;
        this.storySettled = true;
        this.checkLoaded();
      },
      error: () => {
        this.storySettled = true;
        this.checkLoaded();
      },
    });
  }

  // getStory returns 200 with empty data for a nonexistent project (it
  // never checks the project exists), so projectService.get() is the only
  // signal that tells "not found" apart from "no bible written yet".
  private checkLoaded(): void {
    if (this.projectSettled && this.storySettled) this.loading = false;
  }

  goHome(): void {
    this.router.navigate(['/']);
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

  updateNote(note: IdeaNote): void {
    if (!this.canEdit) return;
    const text = note.text.trim();
    if (!text) return;
    this.storyService.updateIdeaNote(this.projectId, note.id, text).subscribe();
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

  // ── Generate from document ──────────────────────────────────────
  // Uploads a script/treatment/manuscript, sends its extracted text to
  // the backend (which asks Claude to infer the fields), and shows the
  // result in a review modal — nothing is written until the user
  // explicitly applies it, since an AI-drafted bible is a starting point
  // to edit, not a fact to trust blindly.

  showGenerateModal = false;
  generating = false;
  generateError = '';
  draft: StoryBibleDraft | null = null;
  applyToScriptId = '';

  async importDocument(): Promise<void> {
    if (!this.canEdit) return;
    const file = await pickFile('.txt,.fountain,.docx,.pdf');
    if (!file) return;

    this.draft = null;
    this.generateError = '';
    this.generating = true;
    this.showGenerateModal = true;
    this.applyToScriptId = this.scripts[0]?.scriptId ?? '';

    let text: string;
    try {
      text = await extractDocumentText(file);
    } catch (err) {
      this.generateError = err instanceof Error ? err.message : 'Could not read that file.';
      this.generating = false;
      return;
    }

    this.storyService.generate(this.projectId, text).subscribe({
      next: draft => {
        this.draft = draft;
        this.generating = false;
      },
      error: err => {
        this.generateError = err?.error?.error || 'Could not generate a story bible from that document.';
        this.generating = false;
      },
    });
  }

  closeGenerateModal(): void {
    this.showGenerateModal = false;
    this.draft = null;
  }

  confirmApplyDraft(): void {
    if (!this.draft || !this.bible) return;

    this.bible.coreQuestion = this.draft.coreQuestion;
    this.bible.genre = this.draft.genre;
    this.bible.tone = this.draft.tone;
    this.bible.theme = this.draft.theme;
    this.saveBible();

    const row = this.scripts.find(s => s.scriptId === this.applyToScriptId);
    if (row) {
      row.logline = this.draft.logline;
      row.synopsis = this.draft.synopsis;
      this.saveScriptStory(row);
    }

    this.showGenerateModal = false;
    this.draft = null;
  }
}
