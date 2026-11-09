import { buildAgentGraph } from '../../diagrams/agentflow/graph.js';
import type { AgentflowDb } from '../../diagrams/agentflow/db.js';
import { direction } from '../../layout/compound.js';
import type { AsciiDiagram } from '../core.js';
import { drawAgentLanes } from '../draw/agent-lanes.js';

export const agentflow: AsciiDiagram<AgentflowDb> = {
  type: 'agentflow',
  render(db, ctx) {
    const graph = buildAgentGraph(db, 8);
    const dir = direction(db.direction);
    return drawAgentLanes(graph.nodes.map(n => n.kind === 'connector' ? { ...n, shape: 'connector' } : n), graph.edges, ctx, ctx.compact && (dir === 'LR' || dir === 'RL') ? 'TB' : dir, true);
  },
};
