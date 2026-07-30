export type ItemStatus = 'not_started' | 'in_progress' | 'done';

export interface WorkflowItem {
  key: string;
  label: string;
  status: ItemStatus;
  detail: string;
  /** Present only for the one row (Story Bible) that navigates via a
   *  route instead of opening a drawer in this editor. */
  routerLink?: string[];
}

export interface WorkflowPhase {
  name: string;
  items: WorkflowItem[];
}

/** Three-state status from a "how many of N are done" count — the
 *  shape shared by breakdown/casting/scouting/schedule/shots/
 *  milestones: nothing done is "not started," everything done is
 *  "done," anything in between is "in progress." total === 0 (nothing
 *  to do yet) is also "not started," not "done," so an empty script
 *  doesn't read as complete. */
export function fractionStatus(done: number, total: number): ItemStatus {
  if (total === 0 || done === 0) return 'not_started';
  if (done >= total) return 'done';
  return 'in_progress';
}

/** Two-state status for open-ended lists with no real "done" concept
 *  (crew, rehearsals, continuity notes, budget line items, etc.) —
 *  either nothing's been added yet, or something has. */
export function presenceStatus(count: number): ItemStatus {
  return count > 0 ? 'in_progress' : 'not_started';
}

/** Percent of a phase's items that are done, counting "in progress"
 *  as half credit — drives the phase-level progress bar. */
export function phaseProgressPercent(phase: WorkflowPhase): number {
  if (!phase.items.length) return 0;
  const score = phase.items.reduce((sum, item) => {
    if (item.status === 'done') return sum + 1;
    if (item.status === 'in_progress') return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((score / phase.items.length) * 100);
}
