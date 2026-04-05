'use client';

import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import Icon from '@mdi/react';
import {
  mdiDatabase,
  mdiServer,
  mdiDesktopClassic,
  mdiLanConnect,
  mdiCloud,
  mdiCog,
  mdiApplication,
  mdiShieldLock,
  mdiPackageVariant,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CINode {
  id: string;
  name: string;
  type: string;
  status: string;
  ciNumber: string | number;
  isCurrent?: boolean;
}

interface CIRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  relationshipType?: string;
  relationshipTypeRef?: { forwardLabel: string; reverseLabel: string } | null;
  confidenceScore?: number | null;
  source: CINode;
  target: CINode;
}

interface ImpactCI {
  id: string;
  name: string;
  type: string;
  status: string;
  ciNumber: string | number;
}

interface RelationshipMapProps {
  ci: {
    id: string;
    name: string;
    type: string;
    status: string;
    ciNumber: string | number;
    sourceRelations?: CIRelation[];
    targetRelations?: CIRelation[];
    sourceRels?: CIRelation[];
    targetRels?: CIRelation[];
  };
  impactData: ImpactCI[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCITypeIcon(type: string): string {
  switch (type) {
    case 'SERVER':          return mdiServer;
    case 'WORKSTATION':     return mdiDesktopClassic;
    case 'NETWORK_DEVICE':  return mdiLanConnect;
    case 'DATABASE':        return mdiDatabase;
    case 'CLOUD_RESOURCE':  return mdiCloud;
    case 'SERVICE':         return mdiCog;
    case 'APPLICATION':     return mdiApplication;
    case 'SECURITY_DEVICE': return mdiShieldLock;
    case 'STORAGE':         return mdiPackageVariant;
    default:                return mdiServer;
  }
}

function getStatusBorderColor(status: string): string {
  switch (status) {
    case 'ACTIVE':         return '#16a34a';
    case 'MAINTENANCE':    return '#d97706';
    case 'INACTIVE':       return '#9ca3af';
    case 'DECOMMISSIONED': return '#dc2626';
    default:               return '#d1d5db';
  }
}

// ─── Dagre Layout ─────────────────────────────────────────────────────────────

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPos = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPos.x - NODE_WIDTH / 2,
        y: nodeWithPos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

// ─── Custom Node ──────────────────────────────────────────────────────────────

interface CINodeData extends Record<string, unknown> {
  label: string;
  ciNumber: string;
  ciType: string;
  status: string;
  isCurrent: boolean;
  isImpacted: boolean;
  hasImpactOverlay: boolean;
}

function CINodeComponent({ data }: NodeProps) {
  const nodeData = data as CINodeData;
  const borderColor = getStatusBorderColor(nodeData.status as string);
  const icon = getCITypeIcon(nodeData.ciType as string);
  const isCurrent = nodeData.isCurrent as boolean;
  const isImpacted = nodeData.isImpacted as boolean;
  const hasImpactOverlay = nodeData.hasImpactOverlay as boolean;

  let borderStyle = `2px solid ${borderColor}`;
  let boxShadow = 'none';
  let opacity = 1;
  let backgroundColor = isCurrent ? '#f0f0ff' : 'var(--bg-primary)';

  if (hasImpactOverlay) {
    if (isImpacted) {
      borderStyle = '3px solid #dc2626';
      boxShadow = '0 0 12px rgba(220, 38, 38, 0.5)';
      backgroundColor = '#fff1f2';
    } else if (!isCurrent) {
      opacity = 0.3;
    }
  }

  return (
    <div
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        backgroundColor,
        border: borderStyle,
        boxShadow,
        opacity,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        fontSize: 12,
        transition: 'opacity 0.2s, box-shadow 0.2s',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Icon path={icon} size={0.8} color={borderColor} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ fontWeight: isCurrent ? 700 : 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nodeData.label as string}
        </div>
        <div style={{ color: 'var(--text-placeholder)', fontSize: 11 }}>CI-{nodeData.ciNumber as string}</div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { ciNode: CINodeComponent };

// ─── Relationship Map ─────────────────────────────────────────────────────────

export default function RelationshipMap({ ci, impactData }: RelationshipMapProps) {
  const impactedIds = useMemo(() => {
    if (!impactData) return new Set<string>();
    return new Set(impactData.map((imp) => imp.id));
  }, [impactData]);

  const hasImpactOverlay = impactData !== null;

  const { rawNodes, rawEdges } = useMemo(() => {
    const nodesMap = new Map<string, CINode>();
    nodesMap.set(ci.id, { id: ci.id, name: ci.name, type: ci.type, status: ci.status, ciNumber: ci.ciNumber, isCurrent: true });

    for (const rel of [...(ci.sourceRelations ?? ci.sourceRels ?? []), ...(ci.targetRelations ?? ci.targetRels ?? [])]) {
      if (!nodesMap.has(rel.source.id)) nodesMap.set(rel.source.id, rel.source);
      if (!nodesMap.has(rel.target.id)) nodesMap.set(rel.target.id, rel.target);
    }

    const rNodes: Node[] = Array.from(nodesMap.values()).map((n) => ({
      id: n.id,
      type: 'ciNode',
      position: { x: 0, y: 0 },
      data: {
        label: n.name,
        ciNumber: n.ciNumber,
        ciType: n.type,
        status: n.status,
        isCurrent: n.isCurrent ?? false,
        isImpacted: impactedIds.has(n.id),
        hasImpactOverlay,
      } as CINodeData,
    }));

    const allRelIds = new Set<string>();
    const rEdges: Edge[] = [];
    for (const rel of [...(ci.sourceRelations ?? ci.sourceRels ?? []), ...(ci.targetRelations ?? ci.targetRels ?? [])]) {
      if (!allRelIds.has(rel.id)) {
        allRelIds.add(rel.id);
        const edgeLabel = rel.relationshipTypeRef?.forwardLabel
          ?? (rel.relationshipType ?? rel.type).replace(/_/g, ' ').toLowerCase();
        rEdges.push({
          id: rel.id,
          source: rel.sourceId,
          target: rel.targetId,
          label: edgeLabel,
          style: { stroke: 'var(--text-placeholder)', strokeWidth: 1.5 },
          labelStyle: { fontSize: 10, fill: 'var(--text-placeholder)' },
        });
      }
    }

    return { rawNodes: rNodes, rawEdges: rEdges };
  }, [ci, impactedIds, hasImpactOverlay]);

  const layoutNodes = useMemo(() => applyDagreLayout(rawNodes, rawEdges), [rawNodes, rawEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  // Sync nodes when layout changes (impact overlay update)
  useMemo(() => {
    setNodes(layoutNodes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--border-primary)" gap={16} />
      <Controls />
    </ReactFlow>
  );
}
