import { CreditsCastRow, CreditsCrewRow } from '../services/credits.service';

/** Builds the plain-text end-credits block — cast then crew, then any
 *  additional credits (music licences, location acknowledgements,
 *  funding/sponsor logos). Plain text rather than a PDF: this is meant
 *  to be pasted straight into an NLE's title/credits sequence, not
 *  printed. */
export function buildCreditsText(scriptTitle: string, cast: CreditsCastRow[], crew: CreditsCrewRow[], additionalCredits: string): string {
  const lines: string[] = [scriptTitle.trim() || 'Untitled', ''];

  if (cast.length) {
    lines.push('CAST', '');
    for (const c of cast) {
      lines.push(`${c.characterName || 'Unnamed role'} .... ${c.actorName || 'TBD'}`);
    }
    lines.push('');
  }

  if (crew.length) {
    lines.push('CREW', '');
    for (const m of crew) {
      lines.push(`${m.role || 'Crew'} .... ${m.name}`);
    }
    lines.push('');
  }

  if (additionalCredits.trim()) {
    lines.push(additionalCredits.trim());
  }

  return lines.join('\n').trim() + '\n';
}

export function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.txt') ? filename : `${filename}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
