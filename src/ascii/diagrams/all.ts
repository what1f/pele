// 所有已实现的字符渲染器。新增一种图：写 ./<type>.ts 导出一个 AsciiDiagram，再加到这里。
import type { AsciiDiagram } from '../core.js';
import { flowchart } from './flowchart.js';
import { sequence } from './sequence.js';
import { classDiagram } from './class.js';
import { er } from './er.js';
import { gantt } from './gantt.js';
import { git } from './git.js';
import { state } from './state.js';

export const all: AsciiDiagram[] = [
  flowchart,
  sequence,
  classDiagram,
  er,
  gantt,
  git,
  state,
];
