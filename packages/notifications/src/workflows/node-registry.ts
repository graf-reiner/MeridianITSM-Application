// ─── Workflow Node Registry ───────────────────────────────────────────────────
// Pluggable registry for all workflow node types. Nodes register themselves
// at import time. The registry is used by:
//   - The API to serve node definitions to the frontend palette
//   - The executor to look up and call node execute functions
//   - The validator to check node configurations

import type { NodeDefinition, NodeDefinitionDTO } from './types.js';

const registry = new Map<string, NodeDefinition>();

/**
 * Register a node type. Called at module load time by each node file.
 */
export function registerNode(definition: NodeDefinition): void {
  if (registry.has(definition.type)) {
    console.warn(`[workflow-registry] Overwriting node type: ${definition.type}`);
  }
  registry.set(definition.type, definition);
}

/**
 * Get a single node definition by type.
 */
export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return registry.get(type);
}

/**
 * Get all registered node definitions.
 */
export function getAllNodeDefinitions(): NodeDefinition[] {
  return [...registry.values()];
}

/**
 * Get node definitions filtered by category.
 */
export function getNodesByCategory(category: string): NodeDefinition[] {
  return [...registry.values()].filter(n => n.category === category);
}

/**
 * Get all node definitions as DTOs (without execute functions) for the frontend.
 */
export function getAllNodeDefinitionDTOs(): NodeDefinitionDTO[] {
  return [...registry.values()].map(({ execute, ...rest }) => rest);
}

/**
 * Get the count of registered nodes.
 */
export function getRegisteredNodeCount(): number {
  return registry.size;
}
