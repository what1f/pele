// 所有已实现的字符渲染器。新增一种图：写 ./<type>.ts 导出一个 AsciiDiagram，再加到这里。
import type { AsciiDiagram } from '../core.js';
import { flowchart } from './flowchart.js';
import { sequence } from './sequence.js';
import { architecture } from './architecture.js';
import { block } from './block.js';
import { c4 } from './c4.js';
import { classDiagram } from './class.js';
import { cynefin } from './cynefin.js';
import { er } from './er.js';
import { gantt } from './gantt.js';
import { git } from './git.js';
import { info } from './info.js';
import { ishikawa } from './ishikawa.js';
import { journey } from './journey.js';
import { kanban } from './kanban.js';
import { mindmap } from './mindmap.js';
import { packet } from './packet.js';
import { pie } from './pie.js';
import { quadrant } from './quadrant.js';
import { radar } from './radar.js';
import { railroad } from './railroad.js';
import { requirement } from './requirement.js';
import { sankey } from './sankey.js';
import { state } from './state.js';
import { timeline } from './timeline.js';
import { treeView } from './treeView.js';
import { treemap } from './treemap.js';
import { usecase } from './usecase.js';
import { venn } from './venn.js';
import { xychart } from './xychart.js';

export const all: AsciiDiagram[] = [
  flowchart,
  sequence,
  architecture,
  block,
  c4,
  classDiagram,
  cynefin,
  er,
  gantt,
  git,
  info,
  ishikawa,
  journey,
  kanban,
  mindmap,
  packet,
  pie,
  quadrant,
  radar,
  railroad,
  requirement,
  sankey,
  state,
  timeline,
  treeView,
  treemap,
  usecase,
  venn,
  xychart,
];
