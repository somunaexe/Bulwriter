import { SceneEntry, csvCell } from './scene-breakdown';

export interface ScheduleDay {
  dayNumber: number;
  strips: SceneEntry[];
}

const MAX_STRIPS_PER_DAY = 6;

/** Groups scenes by location (heading text, time-of-day stripped —
 *  what matters for scheduling is *where* you're shooting, not what the
 *  scene's time of day is), preserving script order among scenes that
 *  share a location, then chunks the result into days of at most
 *  MAX_STRIPS_PER_DAY scenes. This is only ever the STARTING POINT for a
 *  script with no saved schedule yet — once a producer saves one (even
 *  once, even by just dragging one strip), the persisted day/position
 *  layout is authoritative and this is never consulted again. */
export function autoSuggestDays(scenes: SceneEntry[]): ScheduleDay[] {
  const order: string[] = [];
  const byLocation = new Map<string, SceneEntry[]>();

  for (const scene of scenes) {
    const key = normalizeLocation(scene.heading);
    if (!byLocation.has(key)) {
      byLocation.set(key, []);
      order.push(key);
    }
    byLocation.get(key)!.push(scene);
  }

  const flattened: SceneEntry[] = order.flatMap(key => byLocation.get(key)!);

  const days: ScheduleDay[] = [];
  for (let i = 0; i < flattened.length; i += MAX_STRIPS_PER_DAY) {
    days.push({
      dayNumber: days.length + 1,
      strips: flattened.slice(i, i + MAX_STRIPS_PER_DAY),
    });
  }
  return days.length ? days : [{ dayNumber: 1, strips: [] }];
}

export function normalizeLocation(heading: string): string {
  return heading
    .replace(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?)\s*/i, '')
    .replace(/\s*-\s*(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|CONTINUOUS|LATER)\s*$/i, '')
    .trim()
    .toUpperCase();
}

export function scheduleToCsv(days: ScheduleDay[]): string {
  const header = ['Day', '#', 'Scene', 'Cast'];
  const lines = [header.map(csvCell).join(',')];

  for (const day of days) {
    for (const strip of day.strips) {
      lines.push([
        String(day.dayNumber),
        String(strip.number),
        strip.heading,
        strip.cast.join('; '),
      ].map(csvCell).join(','));
    }
  }

  return lines.join('\r\n');
}
