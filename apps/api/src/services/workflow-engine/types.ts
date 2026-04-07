// ─── Workflow Engine Type Definitions ──────────────────────────────────────────

import type { EventContext } from '../notification-rules-conditions.js';

// ─── Graph Structure (React Flow compatible) ────────────────────────────────

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;
  type: string;                   // Maps to NodeDefinition.type
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, unknown>;  // Node-specific configuration
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;          // For conditions: 'true' | 'false' | 'case_X'
  targetHandle?: string;
  label?: string;
}

// ─── Node Definition (for the registry) ─────────────────────────────────────

export interface NodeDefinition {
  type: string;
  category: 'trigger' | 'condition' | 'action' | 'control' | 'data';
  label: string;
  description: string;
  icon: string;                   // MDI icon path name (e.g., 'mdiTicketOutline')
  color: string;                  // CSS color for node header
  inputs: PortDefinition[];       // Input handles
  outputs: PortDefinition[];      // Output handles
  configSchema: FieldSchema[];    // Configuration form schema
  execute?: (config: Record<string, unknown>, context: ExecutionContext) => Promise<NodeResult>;
}

export interface PortDefinition {
  id: string;
  label: string;
  type: 'default' | 'true' | 'false' | string;  // string for switch cases
}

export interface FieldSchema {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'number' | 'json' | 'entity_select' | 'dynamic_select';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: unknown;
}

// ─── Execution Types ────────────────────────────────────────────────────────

export interface ExecutionContext {
  tenantId: string;
  workflowId: string;
  executionId: string;
  eventContext: EventContext;
  variables: Record<string, unknown>;   // Accumulated node outputs
  isSimulation: boolean;
  recursionDepth: number;
}

export interface NodeResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  nextPort?: string;    // Which output port to follow (for conditions: 'true'/'false')
}

// ─── Serializable node definition for the frontend palette ──────────────────

export interface NodeDefinitionDTO {
  type: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  configSchema: FieldSchema[];
}
