// Draws the README poster's diagrams as text and prints them as JSON, for scripts/ascii-poster.py.
// Run `npm run build` first.
import { renderAscii } from '../dist/ascii.js';

const SOURCES = {
  Sequence: `sequenceDiagram
  actor U as User
  participant C as CLI
  participant A as Agent
  participant T as Tools
  U->>C: pele fix the build
  C->>A: prompt
  activate A
  A->>T: run tests
  T-->>A: 3 failures
  A->>T: edit files
  T-->>A: ok
  A-->>C: summary
  deactivate A
  C-->>U: done ✓`,
  Flowchart: `flowchart TD
  A[Mermaid text] --> B{Terminal can show images?}
  B -->|yes| C[SVG / PNG]
  B -->|no| D[Text]
  D --> E([Claude Code])
  D --> F([CI logs])`,
  'XY chart': `xychart-beta
  title "Weekly renders"
  x-axis [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  y-axis "k" 0 --> 50
  bar [12, 18, 25, 31, 44, 20, 15]
  line [12, 18, 25, 31, 44, 20, 15]`,
  Pie: `pie title Where the time goes
  "Layout" : 46
  "Parsing" : 28
  "Drawing" : 18
  "Output" : 8`,
  Gantt: `gantt
  title Release
  dateFormat YYYY-MM-DD
  section Build
  Parser   :a1, 2026-01-01, 6d
  Layout   :a2, after a1, 8d
  section Ship
  Docs     :b1, after a2, 4d
  Release  :milestone, after b1, 0d`,
  Treemap: `treemap-beta
"Bundle"
    "Parsers": 120
    "Layout": 90
    "ASCII": 60
    "Themes": 20`,
  Venn: `venn-beta
  title Good diagrams
  set A["Correct"]
  set B["Readable"]
  union A,B["Ship it"]`,
  'Git graph': `gitGraph
  commit
  branch feature
  commit
  commit
  checkout main
  commit
  merge feature
  branch fix
  commit
  checkout main
  merge fix
  commit`,
};

const WIDTH = 58; // two columns fit a README at a readable size
const drawings = Object.entries(SOURCES).map(([name, source]) => ({ name, lines: renderAscii(source, { maxWidth: WIDTH }).lines }));
process.stdout.write(JSON.stringify({ width: WIDTH, drawings }));
