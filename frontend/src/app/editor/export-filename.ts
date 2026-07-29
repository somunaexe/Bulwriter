/** Central filename convention for every export/download in the app:
 *  the script's title on its own for the main screenplay export, or the
 *  title plus a suffix for everything else — e.g. "My Script shoot
 *  schedule", "My Script breakdown". Falls back to the script id if the
 *  title hasn't loaded yet (or is blank). */
export function scriptExportFilename(scriptTitle: string | undefined | null, scriptId: string, suffix?: string): string {
  const trimmed = scriptTitle?.trim();
  const base = trimmed ? trimmed.replace(/[\\/:*?"<>|]/g, '-') : scriptId;
  return suffix ? `${base} ${suffix}` : base;
}
