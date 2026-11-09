# pele/ascii：终端字符图

在 pele 上加一条输出：同一份 Mermaid 源码，除了 SVG，还能画成终端里的字符图（Unicode 框线，或纯 ASCII）。
目标是 Claude Code 之类的 TUI：终端不支持图片协议时，用它显示图表。

```ts
import { renderAscii } from 'pele/ascii';
const { text, width, height } = renderAscii(source, { maxWidth: 100 });
```

## 分层

```
Mermaid 源码
  │  pele parse()            （原样复用：预处理、识别类型、各图的解析器）
  ▼
DiagramModel（按 type 区分）
  │  diagrams/<type>.ts      （每种图一个字符渲染器：模型 → Canvas）
  │    ├─ text/label.ts      标签 → 若干行纯文本（复用 pele layoutLabel，宽度按终端列数量）
  │    ├─ layout/graph.ts    节点-连线类图的排版（复用 pele compoundLayout，像素 → 格子）
  │    ├─ draw/shapes.ts     节点形状
  │    └─ draw/edges.ts      连线、箭头、端点标记、标签位置
  ▼
Canvas（canvas/canvas.ts）   稀疏格子画布：线条按「四个方向的臂」叠加，自动拼成拐角、T 字、十字
  │  toLines('unicode' | 'ascii')
  ▼
文本
```

| 文件 | 作用 |
| --- | --- |
| `src/ascii/index.ts` | 入口 `renderAscii`：解析、找渲染器、加标题、太宽时用紧凑模式重画、仍放不下抛 `too-wide` |
| `src/ascii/core.ts` | 类型：`AsciiOptions`、`AsciiContext`、`AsciiDiagram`、`AsciiError`；注册表 |
| `src/ascii/diagrams/all.ts` | 已实现的渲染器列表（显式导出，不靠 import 副作用，和 pele 一致） |
| `src/ascii/diagrams/flowchart.ts` | 参考实现：节点-连线类图怎么写照着它 |
| `src/ascii/canvas/canvas.ts` | 画布：`segment` `path` `stub` `box` `clear` `put` `text` `textIn` `blit` `armsAt` |
| `src/ascii/canvas/glyphs.ts` | 框线字符表（细/粗/双线、混合、虚线、圆角），ASCII 降级表 |
| `src/ascii/text/width.ts` | 显示宽度：`displayWidth` `cells` `truncate` `wrap`，中日韩、全角、emoji 占 2 格 |

## 画布约定

- 坐标是格子 `(x, y)`，x 向右、y 向下，可以是负数，输出时裁剪到用到的范围。
- 宽字符占两格：第一格存字符，第二格是占位（输出时跳过）。往占位格写东西会把整个宽字符清掉，不会留下半个字。
- 线条不是直接写字符，而是在格子上记「上下左右哪几条臂、什么粗细」，输出时查表得到 `─│┌┬┼╋═╬` 等。
  所以两条线交汇会自动变成 `┼`，线接到框边上会变成 `├`，不需要渲染器操心。
- 文字优先于线条：同一格既有臂又有字时显示字。所以「先画线，再写字」，或者先 `clear` 再写。
- `box(…, { fill })` 默认会清掉框内部，适合节点；分组框传 `fill: false`。
- `Role`（`border` `edge` `text` `label` `title` `muted` `accent` `series0…`）记在格子上，现在只用于将来上色，不影响输出文本。

## 渲染器约定

- 签名：`(model, ctx) => Canvas`。`ctx.maxWidth` 是可用列数（不限时为 `Infinity`），`ctx.compact` 为 true 表示上一次太宽了，请缩小间距、折行、换方向。
- 标题由入口统一画在图上方，渲染器不要再画 `model.title`。
- 不要读 DOM、不要异步、不要依赖时间或随机数；同样的输入输出必须一样。
- 标签一律经过 `label()`：它会处理 `<br>`、HTML 标签、Markdown、实体，图标（`fa:fa-x`）会被丢掉。
- 量宽度一律用 `displayWidth()`，不要用 `.length`。
- 颜色、`style`、`classDef` 全部忽略，粗细和虚实可以保留（粗线 `stroke: 'heavy'`，虚线 `dashed`）。
- 画不出的东西宁可省略，不要画得很乱：比如图标、图片、数学公式只留文字。

## 质量规范

每种图做完都要逐条对照检查。硬性规则违反任何一条都算 bug；审美要求做不到的，要在报告里说明原因。

### 硬性规则：画对

1. **不重叠**
   - 文字不能被线、框边、别的文字压住或截断；
   - 两个框（节点、参与者、注释、标签）不能互相覆盖；
   - 标签不能盖住框边、箭头或别的标签。
2. **不错位**
   - 宽字符必须整字显示，不能出现半个字；
   - 文字在框里不能贴边，左右至少各留 1 格；
   - 同一个元素的上下边框必须等宽、左右边框必须对齐。
3. **线要接上**
   - 连线、生命线的端点必须接到框边上，接口处用 `├ ┤ ┬ ┴`；
   - 不能悬空，也不能隔一格；
   - 线中间不能有缺口，唯一例外是标签嵌在线上，这时标签左右各留 1 格空白。
4. **箭头正确**：箭头紧贴目标（框外第一格，或生命线所在的那一格），方向和消息/连线方向一致。
5. **不共线**
   - 两条不同的线不能在同一行（或同一列）上重合一段，否则读的人分不清谁是谁；
   - 线也不能和框边、容器边框重合；
   - 线和线交叉时画 `┼` 是可以的。
6. **语义完整**
   - 源码里有含义的信息（参与者、消息、分支、类型、方向、标签、编号等）都要画出来；
   - 实在画不出的（颜色、图标、图片、链接）就省略，不要画成会误导人的样子。
7. **确定性**：同样的输入，输出逐字相同。

### 审美要求：好看、好读

1. **紧凑**
   - 不出现连续两行以上没有信息的空行；
   - 同类元素之间的间距保持一致；
   - 框和容器按内容收紧，不要铺满全图。比如时序图的区块只框住涉及的参与者，分组只包住成员。
2. **对齐**
   - 同一行或同一列的元素按中心对齐；
   - 框内文字统一居中，多行文字每行各自居中；
   - 连线尽量走直线，少拐弯。
3. **层级分明**
   - 主体元素（节点、参与者）用细实线直角框 `┌─┐`；
   - 容器（分组、区块、box）用圆角框或虚线，降低存在感，标题统一嵌在上边框里，例如 `╭─ 标题 ────╮` 或 `┌─ loop [条件] ──┐`，和流程图的分组保持一致；
   - 需要强调的东西（激活、粗线连线）用粗线 `┃ ━`；
   - 次要的线（生命线、虚线连线）用 `┆ ┄`。
4. **一眼能区分**：语义不同的元素在形状上要能区分。比如 actor 和 participant，激活条和生命线，实线消息和虚线消息。
5. **全库统一的符号**
   - 箭头 `▶ ◀ ▲ ▼`、开放箭头 `▷ ◁ △ ▽`、叉 `×`、圆点 `○ ●`、菱形 `◆ ◇`，以 `draw/edges.ts` 里的 `MARKS` 为准；
   - 不要另造一套。
6. **克制**：不加装饰性字符，也不靠颜色传达信息（输出可能根本没有颜色）。
7. **宽度**
   - 常见规模的图应能放进 100 列；
   - `ctx.compact` 时要明显变窄，可以缩小间距、折行、改方向。

### 自检流程

1. 跑一遍语料：`ascii-gallery.ts <type>`，要求 0 失败，再用 `ascii-sheet.py` 拼成 PNG，**亲自看图**。
2. 对照源码，按上面的硬性规则逐条检查，重点看最复杂的几张。
3. 用 `--width 80` 再跑一遍，看紧凑模式的效果。
4. 用中文、长标签、多行标签的用例再看一遍。
5. 抽几张用 `--ascii` 输出看看，确认纯 ASCII 下也能读懂。

## 各种图的字符画法（规划）

| 图 | 画法 |
| --- | --- |
| flowchart | 已实现。分层排版，直角走线；分组是圆角框，标题嵌在上边框；横向图放不下时改竖向 |
| state | 同 flowchart；开始 `●`、结束 `◉`、分叉/汇合粗横条、复合状态是分组、注释用虚线框 |
| class / er / requirement / usecase / c4 / architecture / block | 同 flowchart 走 `layoutGraph`，节点是多栏框（类名/属性/方法分隔线），ER 用 `┼` `○` `<` 这类鸦脚记号 |
| sequence | 参与者一排框，竖直生命线，消息是横线箭头，自调用画成小回环，注释框，`loop/alt/opt/par/critical/break` 画成带标签的框，激活条用粗线 |
| mindmap / treeview | 树：`├──` `└──` 缩进 |
| timeline / journey / kanban | 列或行排列的卡片 |
| gantt | 时间轴 + 横向条 `███`，按 maxWidth 缩放 |
| git | 每个分支一条轨道，提交 `●`，分叉合并用框线 |
| pie / treemap / sankey / venn | 退化为带比例条的列表（`████ 40%`），sankey 列出流向 |
| xychart / radar / quadrant | 字符坐标系：柱子用 `█▇▆…▁`，折线用点，象限画四宫格 |
| packet | 按位画的表格 |
| 其余 | 先抛 `unsupported`，调用方回退到显示源码 |

## 调试

```sh
node scripts/run.mjs scripts/ascii.ts some.mmd --width 100 [--ascii]
node scripts/run.mjs scripts/ascii-gallery.ts flowchart --out /tmp/g.txt   # 整个语料库
python3 scripts/ascii-sheet.py /tmp/g.txt /tmp/g                          # 拼成 PNG 看效果
```

`tests/corpus/<type>-docs.json` 是 Mermaid 文档里的示例，每种图都有。看效果以 PNG 总览图为准：终端字体渲染宽字符的方式和编辑器不同，文本编辑器里对不齐不代表终端里对不齐。
