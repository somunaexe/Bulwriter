// Hidden <input type=file>, clicked programmatically — the standard
// browser pattern for a file picker without a visible form control.
// Shared by every import format (EditorComponent) and by the story
// bible's "Generate from document" upload (StoryComponent).
export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = (event: Event) => {
      resolve((event.target as HTMLInputElement).files?.[0] ?? null);
    };
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
}
