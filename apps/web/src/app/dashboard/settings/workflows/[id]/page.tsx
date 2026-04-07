'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  Handle,
  Position,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiContentSave, mdiCheckCircle, mdiRocketLaunch, mdiPlay, mdiMagnify } from '@mdi/js';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NodeDef {
  type: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  inputs: Array<{ id: string; label: string; type: string }>;
  outputs: Array<{ id: string; label: string; type: string }>;
  configSchema: Array<{ key: string; label: string; type: string; required?: boolean; placeholder?: string; helpText?: string; options?: Array<{ label: string; value: string }>; defaultValue?: unknown }>;
}

interface WorkflowData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  trigger: string;
  graph: { nodes: Node[]; edges: Edge[] };
  versionNumber: number;
  versionId: string | null;
}

// ─── Category Colors ────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  trigger: '#f59e0b',
  condition: '#8b5cf6',
  action: '#059669',
  control: '#ea580c',
  data: '#0284c7',
};

const CATEGORY_LABELS: Record<string, string> = {
  trigger: 'Triggers',
  condition: 'Conditions',
  action: 'Actions',
  control: 'Control Flow',
  data: 'Data',
};

// ─── Custom Node Components ─────────────────────────────────────────────────

// ─── Dynamic Field Components ────────────────────────────────────────────────

const FIELD_VALUE_OPTIONS: Record<string, Array<{ label: string; value: string }>> = {
  priority: [{ label: 'Low', value: 'LOW' }, { label: 'Medium', value: 'MEDIUM' }, { label: 'High', value: 'HIGH' }, { label: 'Critical', value: 'CRITICAL' }],
  status: [{ label: 'New', value: 'NEW' }, { label: 'Open', value: 'OPEN' }, { label: 'In Progress', value: 'IN_PROGRESS' }, { label: 'Pending', value: 'PENDING' }, { label: 'Resolved', value: 'RESOLVED' }, { label: 'Closed', value: 'CLOSED' }, { label: 'Cancelled', value: 'CANCELLED' }],
  type: [{ label: 'Incident', value: 'INCIDENT' }, { label: 'Service Request', value: 'SERVICE_REQUEST' }, { label: 'Problem', value: 'PROBLEM' }],
  source: [{ label: 'Portal', value: 'PORTAL' }, { label: 'Email', value: 'EMAIL' }, { label: 'Agent', value: 'AGENT' }, { label: 'API', value: 'API' }, { label: 'Recurring', value: 'RECURRING' }],
  slaStatus: [{ label: 'OK', value: 'OK' }, { label: 'Warning', value: 'WARNING' }, { label: 'Critical', value: 'CRITICAL' }, { label: 'Breached', value: 'BREACHED' }],
};

// Text-type fields that should show a textarea instead of a single-line input
const TEXT_FIELDS = new Set(['description', 'resolution', 'title']);

function DynamicValueSelect({ selectedField, value, onChange }: { selectedField: string; value: string; onChange: (v: string) => void }) {
  const options = FIELD_VALUE_OPTIONS[selectedField];
  const selectStyle = { width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const };

  // Enum fields → dropdown
  if (options) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
        <option value="">-- Select --</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }

  // Text-heavy fields → textarea
  if (TEXT_FIELDS.has(selectedField)) {
    return (
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder="Enter value..." rows={4} style={{ ...selectStyle, resize: 'vertical' }} />
    );
  }

  // Everything else → text input
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="Enter value..." style={{ ...selectStyle }} />
  );
}

function EntitySelect({ endpoint, value, onChange, placeholder }: { endpoint: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { data: options = [] } = useQuery<Array<{ id: string; name?: string; firstName?: string; lastName?: string }>>({
    queryKey: ['entity-options', endpoint],
    queryFn: async () => {
      const res = await fetch(endpoint, { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? json.users ?? json.groups ?? json.queues ?? json.categories ?? (Array.isArray(json) ? json : []);
    },
    enabled: !!endpoint,
    staleTime: 60000,
  });

  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}>
      <option value="">{placeholder ?? '-- Select --'}</option>
      {options.map(o => (
        <option key={o.id} value={o.id}>
          {o.firstName ? `${o.firstName} ${o.lastName ?? ''}`.trim() : o.name ?? o.id}
        </option>
      ))}
    </select>
  );
}

// ─── Custom Node Component ──────────────────────────────────────────────────

function WorkflowNodeComponent({ data, type, selected }: NodeProps) {
  const nodeData = data as { label: string; config: Record<string, unknown>; nodeDef?: NodeDef };
  const category = nodeData.nodeDef?.category ?? (type?.startsWith('trigger_') ? 'trigger' : type?.startsWith('condition_') ? 'condition' : 'action');
  const color = CATEGORY_COLORS[category] ?? '#6b7280';
  const hasInputs = category !== 'trigger';
  const isCondition = category === 'condition';

  return (
    <div style={{
      backgroundColor: 'var(--bg-primary, #fff)',
      border: `2px solid ${selected ? 'var(--accent-primary, #4f46e5)' : color}`,
      borderRadius: 10,
      minWidth: 180,
      boxShadow: selected ? `0 0 0 2px ${color}40` : '0 2px 8px rgba(0,0,0,0.08)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ backgroundColor: color, padding: '6px 12px', color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {CATEGORY_LABELS[category] ?? category}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #1f2937)' }}>{nodeData.label}</div>
        {nodeData.config && Object.keys(nodeData.config).length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)', marginTop: 4, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {Object.entries(nodeData.config).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ')}
          </div>
        )}
      </div>

      {/* Handles */}
      {hasInputs && <Handle type="target" position={Position.Top} style={{ backgroundColor: color, width: 10, height: 10, border: '2px solid #fff' }} />}

      {isCondition ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true" style={{ backgroundColor: '#16a34a', width: 10, height: 10, border: '2px solid #fff', left: '30%' }} />
          <Handle type="source" position={Position.Bottom} id="false" style={{ backgroundColor: '#dc2626', width: 10, height: 10, border: '2px solid #fff', left: '70%' }} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} id="out" style={{ backgroundColor: color, width: 10, height: 10, border: '2px solid #fff' }} />
      )}
    </div>
  );
}

// ─── Workflow Builder Page ──────────────────────────────────────────────────

export default function WorkflowBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const workflowId = params.id as string;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: Array<{ nodeId?: string; message: string }> } | null>(null);

  // Register all node types as the same component
  const nodeTypes = useMemo(() => {
    const types: Record<string, typeof WorkflowNodeComponent> = {};
    // Pre-register known node type prefixes
    const prefixes = ['trigger_', 'condition_', 'action_', 'control_', 'data_'];
    const knownTypes = [
      'trigger_ticket_created', 'trigger_ticket_updated', 'trigger_ticket_assigned',
      'trigger_ticket_commented', 'trigger_ticket_resolved', 'trigger_sla_warning',
      'trigger_sla_breach', 'trigger_ticket_status_changed',
      'condition_field', 'condition_group',
      'action_send_email', 'action_send_in_app', 'action_send_slack', 'action_send_teams',
      'action_send_webhook', 'action_send_push', 'action_escalate', 'action_update_field',
      'action_change_status', 'action_change_priority', 'action_assign_ticket', 'action_add_comment',
    ];
    for (const t of knownTypes) {
      types[t] = WorkflowNodeComponent;
    }
    return types;
  }, []);

  // Load workflow
  const { data: workflow, isLoading: wfLoading } = useQuery<WorkflowData>({
    queryKey: ['workflow-builder', workflowId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/workflows/${workflowId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load workflow');
      return res.json();
    },
  });

  // Load node definitions for palette
  const { data: nodeDefs = [] } = useQuery<NodeDef[]>({
    queryKey: ['workflow-node-defs'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/workflows/node-definitions', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Initialize nodes/edges from workflow graph (only once when data loads)
  const graphInitialized = useRef(false);
  useEffect(() => {
    if (workflow?.graph && nodeDefs.length > 0 && !graphInitialized.current) {
      graphInitialized.current = true;
      const enrichedNodes = (workflow.graph.nodes ?? []).map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          nodeDef: nodeDefs.find((d: NodeDef) => d.type === n.type),
        },
      }));
      setNodes(enrichedNodes);
      setEdges(workflow.graph.edges ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow, nodeDefs]);

  // Group node defs by category, filtered by search
  const groupedDefs = useMemo(() => {
    const filtered = paletteSearch
      ? nodeDefs.filter(d => d.label.toLowerCase().includes(paletteSearch.toLowerCase()) || d.description.toLowerCase().includes(paletteSearch.toLowerCase()))
      : nodeDefs;
    const groups: Record<string, NodeDef[]> = {};
    for (const def of filtered) {
      (groups[def.category] ??= []).push(def);
    }
    return groups;
  }, [nodeDefs, paletteSearch]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const selectedNodeDef = selectedNode ? nodeDefs.find(d => d.type === selectedNode.type) : null;

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({ ...connection, id: `e-${Date.now()}` }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Add node from palette
  const addNodeToCanvas = useCallback((def: NodeDef) => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: def.type,
      position: { x: 250 + Math.random() * 200, y: 100 + nodes.length * 120 },
      data: {
        label: def.label,
        config: {},
        nodeDef: def,
      },
    };
    setNodes(nds => [...nds, newNode]);
  }, [nodes.length, setNodes]);

  // Update node config from properties panel
  const updateNodeConfig = useCallback((nodeId: string, key: string, value: unknown) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, config: { ...(n.data as any).config, [key]: value } } } : n
    ));
  }, [setNodes]);

  // Save graph
  const handleSave = async () => {
    setSaving(true);
    // Strip nodeDef from data before saving (it's runtime-only)
    const cleanNodes = nodes.map(n => ({
      ...n,
      data: { label: (n.data as any).label, config: (n.data as any).config ?? {} },
    }));
    await fetch(`/api/v1/settings/workflows/${workflowId}/graph`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ graph: { nodes: cleanNodes, edges } }),
    });
    setSaving(false);
    void qc.invalidateQueries({ queryKey: ['workflow-builder', workflowId] });
  };

  // Validate
  const handleValidate = async () => {
    const res = await fetch(`/api/v1/settings/workflows/${workflowId}/validate`, { method: 'POST', credentials: 'include' });
    if (res.ok) setValidationResult(await res.json());
  };

  // Publish
  const handlePublish = async () => {
    setPublishing(true);
    // Save first
    await handleSave();
    const res = await fetch(`/api/v1/settings/workflows/${workflowId}/publish`, { method: 'POST', credentials: 'include' });
    if (res.ok) {
      void qc.invalidateQueries({ queryKey: ['workflow-builder', workflowId] });
    }
    setPublishing(false);
  };

  // Delete node
  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
    setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId, setNodes, setEdges]);

  if (wfLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading workflow...</div>;
  if (!workflow) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>Workflow not found</div>;

  const statusColor = workflow.status === 'PUBLISHED' ? '#059669' : workflow.status === 'DISABLED' ? '#6b7280' : '#f59e0b';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>

      {/* ── Top Bar ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', flexShrink: 0 }}>
        <Link href="/dashboard/settings/workflows" style={{ display: 'flex', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{workflow.name}</h2>
        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: `${statusColor}20`, color: statusColor }}>
          {workflow.status}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>v{workflow.versionNumber}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => void handleSave()} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
            <Icon path={mdiContentSave} size={0.65} color="currentColor" />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => void handleValidate()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
            <Icon path={mdiCheckCircle} size={0.65} color="currentColor" />
            Validate
          </button>
          <button onClick={() => void handlePublish()} disabled={publishing} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Icon path={mdiRocketLaunch} size={0.65} color="currentColor" />
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Validation errors */}
      {validationResult && !validationResult.valid && (
        <div style={{ padding: '8px 16px', backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: 13 }}>
          {validationResult.errors.map((e, i) => (
            <div key={i} style={{ color: '#dc2626' }}>{e.nodeId ? `Node ${e.nodeId}: ` : ''}{e.message}</div>
          ))}
        </div>
      )}
      {validationResult?.valid && (
        <div style={{ padding: '8px 16px', backgroundColor: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontSize: 13, color: '#166534' }}>
          Workflow is valid and ready to publish.
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left Palette ──────────────────────────────────────────────────── */}
        <div style={{ width: 250, borderRight: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)' }}>
              <Icon path={mdiMagnify} size={0.6} color="var(--text-placeholder)" />
              <input
                type="text"
                value={paletteSearch}
                onChange={e => setPaletteSearch(e.target.value)}
                placeholder="Search nodes..."
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, backgroundColor: 'transparent', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {Object.entries(groupedDefs).map(([category, defs]) => (
            <div key={category}>
              <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 700, color: CATEGORY_COLORS[category] ?? 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {CATEGORY_LABELS[category] ?? category}
              </div>
              {defs.map(def => (
                <button
                  key={def.type}
                  onClick={() => addNodeToCanvas(def)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none',
                    backgroundColor: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)',
                    borderLeft: `3px solid ${CATEGORY_COLORS[def.category] ?? '#ccc'}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ fontWeight: 500 }}>{def.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{def.description}</div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* ── Center Canvas ────────────────────────────────────────────────── */}
        <div ref={reactFlowWrapper} style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes as any}
            fitView
            deleteKeyCode="Delete"
            style={{ backgroundColor: 'var(--bg-secondary, #f9fafb)' }}
          >
            <Background />
            <Controls />
            <MiniMap
              nodeColor={(n: Node) => {
                const cat = n.type?.split('_')[0] ?? '';
                return CATEGORY_COLORS[cat] ?? '#6b7280';
              }}
              style={{ borderRadius: 8 }}
            />
          </ReactFlow>
        </div>

        {/* ── Right Properties Panel ───────────────────────────────────────── */}
        {selectedNode && selectedNodeDef && (
          <div style={{ width: 320, borderLeft: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', overflowY: 'auto', flexShrink: 0, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedNodeDef.label}</h3>
              <button onClick={handleDeleteNode} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>{selectedNodeDef.description}</p>

            {/* Config form from schema */}
            {selectedNodeDef.configSchema.map(field => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {field.label}{field.required ? ' *' : ''}
                </label>

                {field.type === 'select' ? (
                  <select
                    value={String((selectedNode.data as any).config?.[field.key] ?? field.defaultValue ?? '')}
                    onChange={e => updateNodeConfig(selectedNode.id, field.key, e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  >
                    <option value="">-- Select --</option>
                    {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : field.type === 'multiselect' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {field.options?.map(o => (
                      <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={((selectedNode.data as any).config?.[field.key] as string[] ?? []).includes(o.value)}
                          onChange={e => {
                            const current = ((selectedNode.data as any).config?.[field.key] as string[] ?? []);
                            const updated = e.target.checked ? [...current, o.value] : current.filter((v: string) => v !== o.value);
                            updateNodeConfig(selectedNode.id, field.key, updated);
                          }}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={String((selectedNode.data as any).config?.[field.key] ?? '')}
                    onChange={e => updateNodeConfig(selectedNode.id, field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                ) : field.type === 'checkbox' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean((selectedNode.data as any).config?.[field.key])}
                      onChange={e => updateNodeConfig(selectedNode.id, field.key, e.target.checked)}
                    />
                    {field.helpText ?? 'Enabled'}
                  </label>
                ) : field.type === 'json' ? (
                  <textarea
                    value={typeof (selectedNode.data as any).config?.[field.key] === 'string' ? (selectedNode.data as any).config[field.key] : JSON.stringify((selectedNode.data as any).config?.[field.key] ?? '', null, 2)}
                    onChange={e => updateNodeConfig(selectedNode.id, field.key, e.target.value)}
                    placeholder={field.placeholder ?? '[]'}
                    rows={5}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                ) : field.type === 'entity_select' ? (
                  <EntitySelect
                    endpoint={field.helpText?.replace('endpoint:', '') ?? ''}
                    value={String((selectedNode.data as any).config?.[field.key] ?? '')}
                    onChange={v => updateNodeConfig(selectedNode.id, field.key, v)}
                    placeholder={field.placeholder}
                  />
                ) : field.type === 'dynamic_select' ? (
                  <DynamicValueSelect
                    selectedField={String((selectedNode.data as any).config?.field ?? '')}
                    value={String((selectedNode.data as any).config?.[field.key] ?? '')}
                    onChange={v => updateNodeConfig(selectedNode.id, field.key, v)}
                  />
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={String((selectedNode.data as any).config?.[field.key] ?? '')}
                    onChange={e => updateNodeConfig(selectedNode.id, field.key, e.target.value)}
                    placeholder={field.placeholder}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  />
                )}

                {field.helpText && field.type !== 'checkbox' && (
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-placeholder)' }}>{field.helpText}</p>
                )}
              </div>
            ))}

            {/* Node ID for debugging */}
            <div style={{ borderTop: '1px solid var(--bg-tertiary)', paddingTop: 12, marginTop: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--text-placeholder)' }}>Node ID: {selectedNode.id}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
