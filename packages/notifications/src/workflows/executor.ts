// ─── Workflow Execution Engine ─────────────────────────────────────────────────
// Walks a workflow graph, executing each node in sequence. Handles linear
// flows and condition branching (if/else, switch). Records per-node execution
// steps for observability.

import { prisma } from '@meridian/db';
import { maskObject } from '@meridian/core';
import { redis } from '../redis.js';
import { getNodeDefinition } from './node-registry.js';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, ExecutionContext, NodeResult } from './types.js';
import type { EventContext } from '../conditions.js';

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
  queueContext?: { jobId?: string; attemptsMade?: number },
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventPayload: eventContext as any,
      isSimulation,
    },
  });

  try {
    // Increment recursion depth
    await redis.set(depthKey, String(currentDepth + 1), 'EX', 60);

    // Load the graph and workflow name
    const [version, workflowRecord] = await Promise.all([
      prisma.workflowVersion.findUnique({ where: { id: versionId }, select: { graphJson: true } }),
      prisma.workflow.findUnique({ where: { id: workflowId }, select: { name: true } }),
    ]);
    const workflowName = workflowRecord?.name ?? 'Unknown Workflow';

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
      workflowName,
      executionId: execution.id,
      eventContext,
      variables: {},
      isSimulation,
      recursionDepth: currentDepth + 1,
      queueJobId: queueContext?.jobId,
      retryCount: queueContext?.attemptsMade,
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
    const result = await executeNode(currentNode, context, executionId, nodesExecuted === 1);

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
  isFirstStep: boolean,
): Promise<NodeResult> {
  const startedAt = new Date();
  // Sanitize config before persisting — the webhook nodes carry an HMAC `secret`
  // field that must NOT land in the database in plaintext. maskObject is a
  // shallow-only masker (matches keys like /secret|token|password|apikey/i).
  const sanitizedConfig = node.data?.config ? maskObject(node.data.config) : null;
  const step = await prisma.workflowExecutionStep.create({
    data: {
      executionId,
      nodeId: node.id,
      nodeType: node.type ?? 'unknown',
      status: 'RUNNING',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputData: sanitizedConfig as any,
      startedAt,
    },
  });

  // Compose the structured "_meta" envelope written into outputData on every
  // step. Surfaces durationMs / branchTaken / dedupeSkipped for the executions
  // UI without a schema change. queueJobId + retryCount are written once on
  // the first step so they aren't repeated on every node row.
  const buildOutputData = (raw: Record<string, unknown> | undefined, completedAt: Date, nextPort?: string) => {
    const meta: Record<string, unknown> = {
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
    if (nextPort) meta.branchTaken = nextPort;
    if (raw?.deduped === true) meta.dedupeSkipped = true;
    if (isFirstStep) {
      if (context.queueJobId) meta.queueJobId = context.queueJobId;
      if (typeof context.retryCount === 'number') meta.retryCount = context.retryCount;
    }
    return { ...(raw ?? {}), _meta: meta };
  };

  try {
    const definition = getNodeDefinition(node.type ?? '');

    if (!definition?.execute) {
      // Trigger nodes and unrecognized types pass through
      const completedAt = new Date();
      await prisma.workflowExecutionStep.update({
        where: { id: step.id },
        data: {
          status: 'COMPLETED',
          completedAt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          outputData: buildOutputData(undefined, completedAt) as any,
        },
      });
      return { success: true };
    }

    context.currentNodeId = node.id;
    const result = await definition.execute(node.data?.config ?? {}, context);

    // Store output in context variables for downstream nodes
    if (result.output) {
      context.variables[node.id] = result.output;
    }

    const completedAt = new Date();
    await prisma.workflowExecutionStep.update({
      where: { id: step.id },
      data: {
        status: result.success ? 'COMPLETED' : 'FAILED',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        outputData: buildOutputData(result.output, completedAt, result.nextPort) as any,
        error: result.error ?? null,
        completedAt,
      },
    });

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const completedAt = new Date();
    await prisma.workflowExecutionStep.update({
      where: { id: step.id },
      data: {
        status: 'FAILED',
        error: errorMsg,
        completedAt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        outputData: buildOutputData(undefined, completedAt) as any,
      },
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
