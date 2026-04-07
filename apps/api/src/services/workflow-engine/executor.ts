// ─── Workflow Execution Engine ─────────────────────────────────────────────────
// Walks a workflow graph, executing each node in sequence. Handles linear
// flows and condition branching (if/else, switch). Records per-node execution
// steps for observability.

import { prisma } from '@meridian/db';
import { redis } from '../../lib/redis.js';
import { getNodeDefinition } from './node-registry.js';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, ExecutionContext, NodeResult } from './types.js';
import type { EventContext } from '../notification-rules-conditions.js';

const MAX_RECURSION_DEPTH = 3;
const MAX_NODES_PER_EXECUTION = 50; // Safety limit

/**
 * Execute a published workflow against an event context.
 * Creates WorkflowExecution + WorkflowExecutionStep records.
 * Never throws — all errors are caught and recorded.
 */
export async function executeWorkflow(
  tenantId: string,
  workflowId: string,
  versionId: string,
  trigger: string,
  eventContext: EventContext,
  isSimulation = false,
): Promise<void> {
  // Check recursion depth
  const depthKey = `wf-depth:${tenantId}:${eventContext.ticket?.id ?? 'none'}`;
  const currentDepth = parseInt(await redis.get(depthKey) ?? '0', 10);
  if (currentDepth >= MAX_RECURSION_DEPTH) {
    console.warn(`[workflow-engine] Max recursion depth (${MAX_RECURSION_DEPTH}) reached for tenant ${tenantId}`);
    return;
  }

  // Create execution record
  const execution = await prisma.workflowExecution.create({
    data: {
      tenantId,
      workflowId,
      versionId,
      trigger,
      status: 'RUNNING',
      eventPayload: eventContext as any,
      isSimulation,
    },
  });

  try {
    // Increment recursion depth
    await redis.set(depthKey, String(currentDepth + 1), 'EX', 60);

    // Load the graph
    const version = await prisma.workflowVersion.findUnique({
      where: { id: versionId },
      select: { graphJson: true },
    });

    if (!version?.graphJson) {
      await markExecutionDone(execution.id, 'FAILED', 'No graph found for version');
      return;
    }

    const graph = version.graphJson as unknown as WorkflowGraph;
    if (!graph.nodes?.length) {
      await markExecutionDone(execution.id, 'COMPLETED');
      return;
    }

    // Build adjacency map: nodeId -> outgoing edges
    const edgeMap = new Map<string, WorkflowEdge[]>();
    for (const edge of graph.edges) {
      const list = edgeMap.get(edge.source) ?? [];
      list.push(edge);
      edgeMap.set(edge.source, list);
    }

    // Build node map
    const nodeMap = new Map<string, WorkflowNode>();
    for (const node of graph.nodes) {
      nodeMap.set(node.id, node);
    }

    // Find the trigger node (first node of type starting with 'trigger_')
    const triggerNode = graph.nodes.find(n => n.type?.startsWith('trigger_'));
    if (!triggerNode) {
      await markExecutionDone(execution.id, 'FAILED', 'No trigger node found in graph');
      return;
    }

    // Build execution context
    const context: ExecutionContext = {
      tenantId,
      workflowId,
      executionId: execution.id,
      eventContext,
      variables: {},
      isSimulation,
      recursionDepth: currentDepth + 1,
    };

    // Walk the graph starting from the trigger node
    await walkGraph(triggerNode, edgeMap, nodeMap, context, execution.id);

    await markExecutionDone(execution.id, 'COMPLETED');
  } catch (err) {
    console.error(`[workflow-engine] Execution failed for workflow ${workflowId}:`, err);
    await markExecutionDone(execution.id, 'FAILED', err instanceof Error ? err.message : String(err));
  } finally {
    // Decrement recursion depth
    const newDepth = Math.max(0, currentDepth);
    if (newDepth > 0) await redis.set(depthKey, String(newDepth), 'EX', 60);
    else await redis.del(depthKey);
  }
}

/**
 * Walk the graph from a starting node, following edges and executing each node.
 */
async function walkGraph(
  startNode: WorkflowNode,
  edgeMap: Map<string, WorkflowEdge[]>,
  nodeMap: Map<string, WorkflowNode>,
  context: ExecutionContext,
  executionId: string,
  visited = new Set<string>(),
): Promise<void> {
  let currentNode: WorkflowNode | undefined = startNode;
  let nodesExecuted = 0;

  while (currentNode && nodesExecuted < MAX_NODES_PER_EXECUTION) {
    if (visited.has(currentNode.id)) {
      console.warn(`[workflow-engine] Cycle detected at node ${currentNode.id}`);
      break;
    }
    visited.add(currentNode.id);
    nodesExecuted++;

    // Execute the node
    const result = await executeNode(currentNode, context, executionId);

    // Find the next node to execute
    const outgoingEdges = edgeMap.get(currentNode.id) ?? [];

    if (outgoingEdges.length === 0) {
      // End of path
      break;
    }

    if (result.nextPort) {
      // Condition node — follow the matching port
      const matchingEdge = outgoingEdges.find(e => e.sourceHandle === result.nextPort);
      if (matchingEdge) {
        currentNode = nodeMap.get(matchingEdge.target);
      } else {
        // No edge for this port — end of path
        break;
      }
    } else if (outgoingEdges.length === 1) {
      // Single outgoing edge — follow it
      currentNode = nodeMap.get(outgoingEdges[0].target);
    } else {
      // Multiple outgoing edges without a port selection — follow the first (default)
      currentNode = nodeMap.get(outgoingEdges[0].target);
    }
  }
}

/**
 * Execute a single node and record the step.
 */
async function executeNode(
  node: WorkflowNode,
  context: ExecutionContext,
  executionId: string,
): Promise<NodeResult> {
  const step = await prisma.workflowExecutionStep.create({
    data: {
      executionId,
      nodeId: node.id,
      nodeType: node.type ?? 'unknown',
      status: 'RUNNING',
      inputData: node.data?.config as any,
      startedAt: new Date(),
    },
  });

  try {
    const definition = getNodeDefinition(node.type ?? '');

    if (!definition?.execute) {
      // Trigger nodes and unrecognized types pass through
      await prisma.workflowExecutionStep.update({
        where: { id: step.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return { success: true };
    }

    const result = await definition.execute(node.data?.config ?? {}, context);

    // Store output in context variables for downstream nodes
    if (result.output) {
      context.variables[node.id] = result.output;
    }

    await prisma.workflowExecutionStep.update({
      where: { id: step.id },
      data: {
        status: result.success ? 'COMPLETED' : 'FAILED',
        outputData: result.output as any ?? null,
        error: result.error ?? null,
        completedAt: new Date(),
      },
    });

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.workflowExecutionStep.update({
      where: { id: step.id },
      data: { status: 'FAILED', error: errorMsg, completedAt: new Date() },
    });
    return { success: false, error: errorMsg };
  }
}

/**
 * Mark an execution as done (completed or failed).
 */
async function markExecutionDone(executionId: string, status: string, error?: string): Promise<void> {
  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: { status, error: error ?? null, completedAt: new Date() },
  });
}
