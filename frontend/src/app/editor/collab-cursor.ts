// A deterministic, visually-distinct color per collaborator, so the same
// person always gets the same cursor color across sessions without the
// app having to track/assign colors itself.
const CURSOR_COLORS = [
  '#e07a5f', '#3d8b7d', '#6c5ce7', '#c9a227',
  '#2a9d8f', '#e76f51', '#457b9d', '#a8577e',
];

export function colorForUserId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

// y-prosemirror's default cursor builder prints the collaborator's name as
// permanently-visible inline text next to their caret, which sits directly
// in the reading flow of the script. This builds the same caret + label
// but keeps the label hidden (via .collab-cursor-label in styles.scss)
// until the caret is hovered.
export function collabCursorBuilder(user: { name: string; color: string }): HTMLElement {
  const cursor = document.createElement('span');
  cursor.classList.add('collab-cursor');
  cursor.style.setProperty('--collab-color', user.color);

  const label = document.createElement('span');
  label.classList.add('collab-cursor-label');
  label.textContent = user.name;
  cursor.appendChild(label);

  // Non-breaking anchors either side, same as y-prosemirror's default
  // builder — keeps the widget from collapsing to zero width.
  cursor.insertBefore(document.createTextNode('⁠'), label);
  cursor.appendChild(document.createTextNode('⁠'));

  return cursor;
}
