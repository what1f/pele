// 把 Mermaid 文件画成字符图打印出来。
//   node scripts/run.mjs scripts/ascii.ts <file.mmd> [--width N] [--ascii]
// 不给文件时读标准输入。
import { readFileSync } from 'node:fs';
import { renderAscii } from '../src/ascii/index.js';

const args = process.argv.slice(2);
let width: number | undefined;
let charset: 'unicode' | 'ascii' = 'unicode';
let file: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--width') width = Number(args[++i]);
  else if (args[i] === '--ascii') charset = 'ascii';
  else file = args[i];
}
const source = readFileSync(file ?? 0, 'utf8');
try {
  console.log(renderAscii(source, { maxWidth: width, charset }).text);
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
