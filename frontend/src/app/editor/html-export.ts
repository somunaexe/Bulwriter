import { Node as PMNode, DOMSerializer } from 'prosemirror-model';
import { screenplaySchema } from './screenplay-schema';

// Mirrors the on-screen/print formatting (styles.scss, fountain-to-pdf.ts)
// closely enough to read correctly opened directly in a browser or Word.
// Selectors match the schema's own toDOM output exactly (p[data-element]),
// which is also what its parseDOM rules match on import — so a
// Bulwriter-exported HTML file round-trips losslessly if re-imported.
const SCREENPLAY_CSS = `
  body { font-family: 'Courier New', Courier, monospace; font-size: 12pt; line-height: 1.5; max-width: 8.5in; margin: 1in auto; padding: 0 0 0 .5in; color: #111; background: #fff; }
  p { margin: 0 0 6pt; }
  p[data-element="scene"], p[data-element="shot"], p[data-element="sequence"] { text-transform: uppercase; font-weight: bold; margin-top: 18pt; }
  p[data-element="character"], p[data-element="dual_dialogue"] { margin-left: 2.2in; text-transform: uppercase; }
  p[data-element="parenthetical"] { margin-left: 1.6in; }
  p[data-element="parenthetical"]::before { content: "("; }
  p[data-element="parenthetical"]::after { content: ")"; }
  p[data-element="dialogue"] { margin-left: 1in; max-width: 3.5in; }
  p[data-element="transition"] { text-align: right; text-transform: uppercase; }
  p[data-element="lyrics"] { text-align: center; font-style: italic; }
  p[data-element="note"] { color: #888; font-style: italic; }
  p[data-element="title_page_field"] { text-align: center; }
  p[data-element="title_page_field"][data-key="title"] { margin-top: 2in; font-size: 1.3em; font-weight: bold; text-transform: uppercase; }
`;

export function exportScreenplayHtml(doc: PMNode, filename: string): void {
  const serializer = DOMSerializer.fromSchema(screenplaySchema);
  const fragment = serializer.serializeFragment(doc.content, { document });

  const container = document.createElement('div');
  container.appendChild(fragment);

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${filename}</title>
<style>${SCREENPLAY_CSS}</style>
</head>
<body>
${container.innerHTML}
</body>
</html>
`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
