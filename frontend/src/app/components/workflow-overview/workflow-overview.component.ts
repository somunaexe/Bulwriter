import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SyncService } from '../../services/sync.service';
import { StoryService } from '../../services/story.service';
import { SceneBreakdownService } from '../../services/scene-breakdown.service';
import { CastingService } from '../../services/casting.service';
import { ScoutingService } from '../../services/scouting.service';
import { ScheduleService } from '../../services/schedule.service';
import { BudgetService } from '../../services/budget.service';
import { ShotListService } from '../../services/shot-list.service';
import { RehearsalService } from '../../services/rehearsal.service';
import { MusicVfxService } from '../../services/music-vfx.service';
import { ContinuityService } from '../../services/continuity.service';
import { MilestoneService } from '../../services/milestone.service';
import { CreditsService } from '../../services/credits.service';
import { PressKitService } from '../../services/press-kit.service';
import { DistributionService } from '../../services/distribution.service';
import { computeSceneList } from '../../editor/scene-breakdown';
import { normalizeLocation } from '../../editor/stripboard';
import { WorkflowPhase, fractionStatus, presenceStatus, phaseProgressPercent } from '../../editor/dashboard';

@Component({
  selector: 'app-workflow-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './workflow-overview.component.html',
  styleUrls: ['./workflow-overview.component.scss'],
})
export class WorkflowOverviewComponent implements OnChanges {
  @Input() projectId = '';
  @Input() scriptId = '';
  @Output() close = new EventEmitter<void>();
  @Output() openFeature = new EventEmitter<string>();

  loading = true;
  phases: WorkflowPhase[] = [];
  progressOf = phaseProgressPercent;

  constructor(
    private sync: SyncService,
    private storyService: StoryService,
    private breakdownService: SceneBreakdownService,
    private castingService: CastingService,
    private scoutingService: ScoutingService,
    private scheduleService: ScheduleService,
    private budgetService: BudgetService,
    private shotListService: ShotListService,
    private rehearsalService: RehearsalService,
    private musicVfxService: MusicVfxService,
    private continuityService: ContinuityService,
    private milestoneService: MilestoneService,
    private creditsService: CreditsService,
    private pressKitService: PressKitService,
    private distributionService: DistributionService,
  ) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scriptId'] || changes['projectId']) this.load();
  }

  open(key: string): void {
    this.openFeature.emit(key);
  }

  private load(): void {
    if (!this.projectId || !this.scriptId) return;
    this.loading = true;

    const doc = this.sync.getDoc();
    const scenes = doc ? computeSceneList(doc) : [];
    const totalScenes = scenes.length;
    const totalCharactersFromScenes = new Set(scenes.flatMap(s => s.cast));
    const totalLocationsFromScenes = new Set(scenes.map(s => normalizeLocation(s.heading)));

    forkJoin({
      story: this.storyService.get(this.projectId).pipe(catchError(() => of(null))),
      breakdown: this.breakdownService.list(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
      casting: this.castingService.list(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
      scouting: this.scoutingService.list(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
      schedule: this.scheduleService.list(this.projectId, this.scriptId).pipe(catchError(() => of({ strips: [], days: [] }))),
      budget: this.budgetService.get(this.projectId, this.scriptId).pipe(catchError(() => of(null))),
      shots: this.shotListService.list(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
      rehearsals: this.rehearsalService.list(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
      musicVfx: this.musicVfxService.list(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
      continuity: this.continuityService.list(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
      milestones: this.milestoneService.list(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
      credits: this.creditsService.get(this.projectId, this.scriptId).pipe(catchError(() => of(null))),
      pressKit: this.pressKitService.get(this.projectId, this.scriptId).pipe(catchError(() => of(null))),
      festivals: this.distributionService.listFestivals(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
      releaseLinks: this.distributionService.listReleaseLinks(this.projectId, this.scriptId).pipe(catchError(() => of([]))),
    }).subscribe(r => {

      // ── Phase 1: Development ─────────────────────────────────────
      const storyRow = r.story?.scripts.find(s => s.scriptId === this.scriptId);
      const hasLogline = !!storyRow?.logline.trim();
      const hasSynopsis = !!storyRow?.synopsis.trim();
      const storyStatus = hasLogline && hasSynopsis ? 'done' : (hasLogline || hasSynopsis) ? 'in_progress' : 'not_started';
      const storyDetail = hasLogline && hasSynopsis ? 'Logline & synopsis written'
        : hasLogline ? 'Logline written' : hasSynopsis ? 'Synopsis written' : 'Not started yet';

      // ── Phase 2: Pre-Production ──────────────────────────────────
      const taggedSceneKeys = new Set(
        r.breakdown.filter(t => t.props.length || t.costumes.length || t.setDressing.length || t.notes.trim()).map(t => t.sceneKey)
      );
      const taggedCount = scenes.filter(s => taggedSceneKeys.has(s.sceneKey)).length;

      const allCharacters = new Set([...totalCharactersFromScenes, ...r.casting.map(c => c.characterName)]);
      const castCharacters = new Set(r.casting.filter(c => c.isCast).map(c => c.characterName));

      const allLocations = new Set([...totalLocationsFromScenes, ...r.scouting.map(c => c.locationKey)]);
      const selectedLocations = new Set(r.scouting.filter(c => c.isSelected).map(c => c.locationKey));

      const scheduledSceneKeys = new Set(r.schedule.strips.map(s => s.sceneKey));
      const dayCount = new Set(r.schedule.strips.map(s => s.dayNumber)).size;

      const hasBudgetRates = !!r.budget && (r.budget.estimate.dayRate > 0 || r.budget.estimate.locationRate > 0 || r.budget.estimate.castRate > 0 || r.budget.estimate.propRate > 0);
      const budgetLineItemCount = r.budget?.lineItems.length ?? 0;

      const shotSceneKeys = new Set(r.shots.map(s => s.sceneKey));

      const musicVfxDoneCount = r.musicVfx.filter(n => n.status === 'done').length;

      // ── Phase 3: Production ──────────────────────────────────────
      const confirmedDayCount = r.schedule.days.filter(d => d.dataBackedUp && d.dailiesReviewed).length;
      const flaggedContinuityCount = r.continuity.filter(n => n.flagged).length;

      // ── Phase 4: Post-Production ─────────────────────────────────
      const milestoneDoneCount = r.milestones.filter(m => m.status === 'done').length;
      const hasAdditionalCredits = !!r.credits?.credits.additionalCredits.trim();

      // ── Phase 5: Distribution & Release ──────────────────────────
      const pressKitChecks = r.pressKit
        ? [!!r.pressKit.pressKit.poster, !!r.pressKit.pressKit.directorStatement.trim(), r.pressKit.stills.length > 0].filter(Boolean).length
        : 0;
      const acceptedFestivalCount = r.festivals.filter(f => f.status === 'accepted').length;

      this.phases = [
        {
          name: 'Development',
          items: [
            { key: 'story', label: 'Story Bible', status: storyStatus, detail: storyDetail, routerLink: ['/projects', this.projectId, 'story'] },
          ],
        },
        {
          name: 'Pre-Production',
          items: [
            {
              key: 'breakdown', label: 'Scene breakdown',
              status: fractionStatus(taggedCount, totalScenes),
              detail: totalScenes ? `${taggedCount} of ${totalScenes} scenes tagged` : 'No scenes written yet',
            },
            {
              key: 'casting', label: 'Casting',
              status: fractionStatus(castCharacters.size, allCharacters.size),
              detail: allCharacters.size ? `${castCharacters.size} of ${allCharacters.size} characters cast` : 'No characters yet',
            },
            {
              key: 'scouting', label: 'Location scouting',
              status: fractionStatus(selectedLocations.size, allLocations.size),
              detail: allLocations.size ? `${selectedLocations.size} of ${allLocations.size} locations locked in` : 'No locations yet',
            },
            {
              key: 'stripboard', label: 'Shooting schedule',
              status: fractionStatus(scheduledSceneKeys.size, totalScenes),
              detail: totalScenes ? `${scheduledSceneKeys.size} of ${totalScenes} scenes scheduled, ${dayCount} day(s)` : 'Not scheduled yet',
            },
            {
              key: 'budget', label: 'Budget estimate',
              status: presenceStatus((hasBudgetRates ? 1 : 0) + budgetLineItemCount),
              detail: hasBudgetRates || budgetLineItemCount ? `${budgetLineItemCount} line item(s), rates ${hasBudgetRates ? 'set' : 'not set'}` : 'Not started yet',
            },
            {
              key: 'shotlist', label: 'Shot list & storyboards',
              status: fractionStatus(shotSceneKeys.size, totalScenes),
              detail: totalScenes ? `${shotSceneKeys.size} of ${totalScenes} scenes shot-listed` : 'No scenes yet',
            },
            {
              key: 'rehearsals', label: 'Rehearsals',
              status: presenceStatus(r.rehearsals.length),
              detail: `${r.rehearsals.length} rehearsal(s) logged`,
            },
            {
              key: 'musicvfx', label: 'Music & VFX',
              status: fractionStatus(musicVfxDoneCount, r.musicVfx.length),
              detail: r.musicVfx.length ? `${musicVfxDoneCount} of ${r.musicVfx.length} notes resolved` : 'No suggestions yet',
            },
          ],
        },
        {
          name: 'Production',
          items: [
            {
              key: 'stripboard', label: 'Daily wrap log',
              status: fractionStatus(confirmedDayCount, r.schedule.days.length),
              detail: r.schedule.days.length ? `${confirmedDayCount} of ${r.schedule.days.length} days confirmed (backup + dailies)` : 'No shoot days yet',
            },
            {
              key: 'continuity', label: 'Continuity notes',
              status: presenceStatus(r.continuity.length),
              detail: flaggedContinuityCount ? `${r.continuity.length} note(s), ${flaggedContinuityCount} flagged` : `${r.continuity.length} note(s) logged`,
            },
          ],
        },
        {
          name: 'Post-Production',
          items: [
            {
              key: 'milestones', label: 'Milestones',
              status: fractionStatus(milestoneDoneCount, r.milestones.length),
              detail: r.milestones.length ? `${milestoneDoneCount} of ${r.milestones.length} milestones done` : 'No milestones yet',
            },
            {
              key: 'credits', label: 'Credits',
              status: presenceStatus(hasAdditionalCredits ? 1 : 0),
              detail: r.credits ? `${r.credits.cast.length} cast, ${r.credits.crew.length} crew pulled${hasAdditionalCredits ? ', additional credits written' : ''}` : 'Not started yet',
            },
          ],
        },
        {
          name: 'Distribution & Release',
          items: [
            {
              key: 'presskit', label: 'Press kit',
              status: fractionStatus(pressKitChecks, 3),
              detail: `${pressKitChecks} of 3 (poster, statement, stills)`,
            },
            {
              key: 'festival', label: 'Festival & release tracker',
              status: r.festivals.length === 0 && r.releaseLinks.length === 0 ? 'not_started'
                : (acceptedFestivalCount > 0 || r.releaseLinks.length > 0) ? 'done' : 'in_progress',
              detail: `${r.festivals.length} submission(s)${acceptedFestivalCount ? `, ${acceptedFestivalCount} accepted` : ''}, ${r.releaseLinks.length} release link(s)`,
            },
          ],
        },
      ];

      this.loading = false;
    });
  }
}
