// 把语料里的图批量画成字符图，写成一个文本文件，供人工看效果（再用 grid.py 之类转成图片）。
//   node scripts/run.mjs scripts/ascii-gallery.ts <type> [--width N] [--limit N] [--out file] [--files a.mmd b.mmd …]
// <type> 对应 tests/corpus/<type>-docs.json。每张图一节，节头是 `=== <type> #<序号>`。
import { readFileSync, writeFileSync } from 'node:fs';
import { renderAscii } from '../src/ascii/index.js';

const args = process.argv.slice(2);
let width: number | undefined;
let limit = Infinity;
let out: string | undefined;
let type = '';
const files: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--width') width = Number(args[++i]);
  else if (args[i] === '--limit') limit = Number(args[++i]);
  else if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--files') while (i + 1 < args.length && !args[i + 1].startsWith('--')) files.push(args[++i]);
  else type = args[i];
}
const sources: [string, string][] = [];
if (type) {
  const docs = JSON.parse(readFileSync(`tests/corpus/${type}-docs.json`, 'utf8')) as string[];
  docs.slice(0, limit).forEach((s, i) => sources.push([`${type} #${i}`, s]));
}
for (const f of files) sources.push([f.replace(/^.*\//, ''), readFileSync(f, 'utf8')]);

let text = '';
let ok = 0;
let failed = 0;
const started = performance.now();
for (const [name, source] of sources) {
  text += `=== ${name}\n`;
  try {
    text += renderAscii(source, { maxWidth: width }).text + '\n';
    ok++;
  } catch (error) {
    text += `!! ${String(error).split('\n')[0]}\n`;
    failed++;
  }
}
const ms = Math.round(performance.now() - started);
if (out) writeFileSync(out, text);
else process.stdout.write(text);
console.error(`${ok} ok, ${failed} failed, ${ms} ms`);
