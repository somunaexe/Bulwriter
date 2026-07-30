import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../../services/sync.service';
import { CastingService, CastingCandidate, CastingStatus } from '../../services/casting.service';
import { computeSceneList, csvCell, downloadCsv } from '../../editor/scene-breakdown';
import { scriptExportFilename } from '../../editor/export-filename';

// One group per character derived live from the script (same source as
// the breakdown's cast summary) — several actors can audition for the
// same character, so each group holds a list of candidates rather than
// a single actor/contact/status/notes row.
interface CharacterGroup {
  characterName: string;
  sceneCount: number;
  candidates: CastingCandidate[];
  newActorName: string;
  newContact: string;
  newStatus: CastingStatus;
  newNotes: string;
}

const STATUSES: CastingStatus[] = ['open', 'submitted', 'callback'];

function emptyGroup(characterName: string, sceneCount: number, candidates: CastingCandidate[]): CharacterGroup {
  return { characterName, sceneCount, candidates, newActorName: '', newContact: '', newStatus: 'open', newNotes: '' };
}

@Component({
  selector: 'app-casting-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './casting-board.component.html',
  styleUrls: ['./casting-board.component.scss'],
})
export class CastingBoardComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Input() scriptTitle = '';
  @Input() canEdit = false;
  @Output() close = new EventEmitter<void>();

  loading = true;
  groups: CharacterGroup[] = [];
  statuses = STATUSES;

  constructor(
    private sync: SyncService,
    private castingService: CastingService,
  ) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scriptId'] || changes['projectId']) this.load();
  }

  private load(): void {
    if (!this.projectId || !this.scriptId) return;
    this.loading = true;

    const doc = this.sync.getDoc();
    const scenes = doc ? computeSceneList(doc) : [];

    const sceneCounts = new Map<string, number>();
    for (const scene of scenes) {
      for (const name of scene.cast) {
        sceneCounts.set(name, (sceneCounts.get(name) ?? 0) + 1);
      }
    }
    const sortedNames = [...sceneCounts.entries()].sort((a, b) => b[1] - a[1]);

    this.castingService.list(this.projectId, this.scriptId).subscribe({
      next: candidates => {
        const byName = new Map<string, CastingCandidate[]>();
        for (const c of candidates) {
          if (!byName.has(c.characterName)) byName.set(c.characterName, []);
          byName.get(c.characterName)!.push(c);
        }

        this.groups = sortedNames.map(([name, sceneCount]) => emptyGroup(name, sceneCount, byName.get(name) ?? []));

        // A character already tagged with candidates but no longer
        // speaking in the live script still shows — same reasoning as
        // breakdown/scouting: no reason to hide casting work already
        // done just because a cue changed.
        for (const [name, list] of byName) {
          if (!sceneCounts.has(name)) this.groups.push(emptyGroup(name, 0, list));
        }

        this.loading = false;
      },
      error: () => {
        this.groups = sortedNames.map(([name, sceneCount]) => emptyGroup(name, sceneCount, []));
        this.loading = false;
      },
    });
  }

  save(candidate: CastingCandidate): void {
    if (!this.canEdit) return;
    this.castingService.update(
      this.projectId, this.scriptId, candidate.id,
      candidate.actorName, candidate.contact, candidate.status, candidate.notes,
    ).subscribe();
  }

  cast(group: CharacterGroup, candidate: CastingCandidate): void {
    if (!this.canEdit) return;
    group.candidates.forEach(c => c.isCast = c.id === candidate.id);
    this.castingService.cast(this.projectId, this.scriptId, candidate.id).subscribe();
  }

  remove(group: CharacterGroup, candidate: CastingCandidate): void {
    if (!this.canEdit) return;
    group.candidates = group.candidates.filter(c => c.id !== candidate.id);
    this.castingService.remove(this.projectId, this.scriptId, candidate.id).subscribe();
  }

  addCandidate(group: CharacterGroup): void {
    const name = group.newActorName.trim();
    if (!name) return;

    this.castingService.add(
      this.projectId, this.scriptId, group.characterName,
      name, group.newContact.trim(), group.newStatus, group.newNotes.trim(),
    ).subscribe(candidate => {
      group.candidates.push(candidate);
      group.newActorName = '';
      group.newContact = '';
      group.newStatus = 'open';
      group.newNotes = '';
    });
  }

  exportCsv(): void {
    const header = ['Character', 'Scenes', 'Actor', 'Contact', 'Status', 'Cast', 'Notes'];
    const lines = [header.map(csvCell).join(',')];
    for (const group of this.groups) {
      if (!group.candidates.length) {
        lines.push([group.characterName, String(group.sceneCount), '', '', '', '', ''].map(csvCell).join(','));
        continue;
      }
      for (const c of group.candidates) {
        lines.push([
          group.characterName, String(group.sceneCount), c.actorName, c.contact, c.status, c.isCast ? 'Yes' : '', c.notes,
        ].map(csvCell).join(','));
      }
    }
    downloadCsv(lines.join('\r\n'), scriptExportFilename(this.scriptTitle, this.scriptId, 'casting'));
  }
}
