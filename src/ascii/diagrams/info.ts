import { version } from '../../../package.json';
import type { InfoModel } from '../../diagrams/info/model.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiDiagram } from '../core.js';
import { label } from '../text/label.js';
import { wrap } from '../text/width.js';

export const info: AsciiDiagram<InfoModel> = {
  type: 'info',
  render(_model, ctx) {
    const canvas = new Canvas();
    const lines = label(`Pele v${version}`).lines.flatMap(line => wrap(line, ctx.maxWidth));
    lines.forEach((line, y) => canvas.text(0, y, line));
    return canvas;
  },
};
