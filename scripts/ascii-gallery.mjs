// Writes GALLERY.md: one text drawing for every diagram type, each from Mermaid's
// own docs examples (tests/corpus). Run `npm run build` first.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderAscii } from '../dist/ascii.js';

const WIDTH = 100;
const NAMES = {
  agentflow: 'Agent flow', architecture: 'Architecture', block: 'Block', c4: 'C4', class: 'Class',
  cynefin: 'Cynefin', er: 'Entity relationship', eventmodeling: 'Event modeling', flowchart: 'Flowchart',
  gantt: 'Gantt', git: 'Git graph', ishikawa: 'Ishikawa', journey: 'User journey', kanban: 'Kanban',
  mindmap: 'Mindmap', packet: 'Packet', pie: 'Pie', quadrant: 'Quadrant chart', radar: 'Radar',
  railroad: 'Railroad', requirement: 'Requirement', sankey: 'Sankey', sequence: 'Sequence', state: 'State',
  swimlane: 'Swimlane', timeline: 'Timeline', treemap: 'Treemap', treeview: 'Tree view', usecase: 'Use case',
  venn: 'Venn', wardley: 'Wardley map', xychart: 'XY chart',
};

// A drawing that fills a screen without scrolling past it reads best.
const score = ({ width, height }) => (height > 40 ? -height : Math.min(height, 30) + Math.min(width, WIDTH) / 5);

const sections = [];
for (const file of readdirSync('tests/corpus').filter((f) => f.endsWith('-docs.json')).sort()) {
  const type = file.replace('-docs.json', '');
  if (!NAMES[type]) continue;
  let best;
  for (const source of JSON.parse(readFileSync(`tests/corpus/${file}`, 'utf8'))) {
    try {
      const r = renderAscii(source, { maxWidth: WIDTH });
      if (!best || score(r) > score(best.r)) best = { source: source.trim(), r };
    } catch {}
  }
  if (!best) throw new Error(`no ${type} example draws within ${WIDTH} columns`);
  sections.push({ type, name: NAMES[type], ...best });
}

// The contents as a table four links wide.
const toc = (list) => {
  const links = list.map((s) => `[${s.name}](#${s.name.toLowerCase().replace(/ /g, '-')})`);
  const rows = [];
  for (let i = 0; i < links.length; i += 4) rows.push(`| ${[...links.slice(i, i + 4), '', '', ''].slice(0, 4).join(' | ')} |`);
  return ['|  |  |  |  |', '| --- | --- | --- | --- |', ...rows].join('\n');
};

const fence = (lang, text) => {
  let ticks = '```';
  while (text.includes(ticks)) ticks += '`';
  return `${ticks}${lang}\n${text}\n${ticks}`;
};

writeFileSync(
  'GALLERY.md',
  `# pele/ascii gallery

Every diagram type, drawn by \`renderAscii(source, { maxWidth: ${WIDTH} })\`. The examples come from Mermaid's documentation. Regenerate this file with \`npm run build && node scripts/ascii-gallery.mjs\`.

${toc(sections)}

${sections
  .map(
    (s) => `## ${s.name}

${fence('text', s.r.text)}

<details><summary>Source</summary>

${fence('mermaid', s.source)}

</details>
`,
  )
  .join('\n')}`,
);
console.log(`GALLERY.md: ${sections.length} diagram types`);
