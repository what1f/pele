// 所有已实现的字符渲染器。新增一种图：写 ./<type>.ts 导出一个 AsciiDiagram，再加到这里。
import type { AsciiDiagram } from '../core.js';
import { flowchart } from './flowchart.js';
import { sequence } from './sequence.js';
import { wardley } from './wardley.js';
import { eventmodeling } from './eventmodeling.js';
import { architecture } from './architecture.js';
import { block } from './block.js';
import { c4 } from './c4.js';
import { classDiagram } from './class.js';
import { er } from './er.js';
import { gantt } from './gantt.js';
import { git } from './git.js';
import { ishikawa } from './ishikawa.js';
import { mindmap } from './mindmap.js';
import { railroad } from './railroad.js';
import { requirement } from './requirement.js';
import { state } from './state.js';
import { treeView } from './treeView.js';
import { usecase } from './usecase.js';

export const all: AsciiDiagram[] = [
  flowchart,
  sequence,
  wardley,
  eventmodeling,
  architecture,
  block,
  c4,
  classDiagram,
  er,
  gantt,
  git,
  ishikawa,
  mindmap,
  railroad,
  requirement,
  state,
  treeView,
  usecase,
];
