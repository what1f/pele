import { label, type TextBlock } from './label.js';
import { displayWidth, wrap } from './width.js';

// Label layout may keep an unbroken word wider than its requested width.
export function wrappedLabel(raw: string | undefined, maxWidth: number): TextBlock {
  const lines = label(raw, { maxWidth }).lines.flatMap(line => wrap(line, maxWidth));
  return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
}
