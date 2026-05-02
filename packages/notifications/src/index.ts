export * from './conditions.js';
export * from './actions.js';
export * from './dispatch.js';
export * from './types.js';

// ─── Workflow engine ───────────────────────────────────────────────────────
// Side-effect import registers all built-in node types in node-registry.
import './workflows/nodes/index.js';
export {
  dispatchWorkflows,
  invalidateWorkflowCache,
} from './workflows/dispatch.js';
export { executeWorkflow } from './workflows/executor.js';
export {
  registerNode,
  getNodeDefinition,
  getAllNodeDefinitions,
  getAllNodeDefinitionDTOs,
  getNodesByCategory,
} from './workflows/node-registry.js';
export { convertRuleToWorkflowGraph } from './workflows/migration.js';
export type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  NodeDefinition,
  NodeDefinitionDTO,
  NodeResult,
  ExecutionContext,
  FieldSchema,
  PortDefinition,
} from './workflows/types.js';
