// 所有已实现的字符渲染器。新增一种图：写 ./<type>.ts 导出一个 AsciiDiagram，再加到这里。
import type { AsciiDiagram } from '../core.js';
import { flowchart } from './flowchart.js';
import { sequence } from './sequence.js';
import { sankey } from './sankey.js';
import { venn } from './venn.js';
import { cynefin } from './cynefin.js';
import { architecture } from './architecture.js';
import { block } from './block.js';
import { c4 } from './c4.js';
import { classDiagram } from './class.js';
import { er } from './er.js';
import { gantt } from './gantt.js';
import { git } from './git.js';
import { ishikawa } from './ishikawa.js';
import { journey } from './journey.js';
import { kanban } from './kanban.js';
import { mindmap } from './mindmap.js';
import { railroad } from './railroad.js';
import { requirement } from './requirement.js';
import { state } from './state.js';
import { timeline } from './timeline.js';
import { treeView } from './treeView.js';
import { usecase } from './usecase.js';
import { pie } from './pie.js';
import { treemap } from './treemap.js';
import { info } from './info.js';
import { packet } from './packet.js';

export const all: AsciiDiagram[] = [
  pie,
  treemap,
  info,
  packet,
  flowchart,
  sequence,
  sankey,
  venn,
  cynefin,
  architecture,
  block,
  c4,
  classDiagram,
  er,
  gantt,
  git,
  ishikawa,
  journey,
  kanban,
  mindmap,
  railroad,
  requirement,
  state,
  timeline,
  treeView,
  usecase,
];
