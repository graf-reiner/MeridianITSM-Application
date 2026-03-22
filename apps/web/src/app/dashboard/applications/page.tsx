'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import { mdiApplicationCog, mdiAlertOctagon, mdiArchive, mdiCurrencyUsd, mdiPlus, mdiFilter, mdiRefresh } from '@mdi/js';
import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppStats {
  total: number;
  byStatus: Record<string, number>;
  byCriticality: Record<string, number>;
  deprecatedCount: number;
  totalAnnualCost: number;
}

interface AppNode {
  id: string;
  data: {
    name: string;
    criticality: string;
    status: string;
    type: string;
  };
}

interface AppEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface AppListItem {
  id: string;
  name: string;
  type: string;
  status: string;
  criticality: string;
  hostingModel: string | null;
  lifecycleStage: string | null;
  annualCost: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CRITICALITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626' },
  HIGH:     { bg: '#ffedd5', text: '#9a3412', dot: '#ea580c' },
  MEDIUM:   { bg: '#fefce8', text: '#854d0e', dot: '#ca8a04' },
  LOW:      { bg: '#f0fdf4', text: '#065f46', dot: '#22c55e' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE:         { bg: '#f0fdf4', text: '#065f46', dot: '#22c55e' },
  INACTIVE:       { bg: '#f9fafb', text: '#6b7280', dot: '#9ca3af' },
  IN_DEVELOPMENT: { bg: '#eff6ff', text: '#1e40af', dot: '#3b82f6' },
  DEPRECATED:     { bg: '#fdf4ff', text: '#7e22ce', dot: '#a855f7' },
  DECOMMISSIONED: { bg: '#f9fafb', text: '#9ca3af', dot: '#d1d5db' },
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// ─── Dagre Layout ─────────────────────────────────────────────────────────────

const NODE_WIDTH = 180;
const NODE_HEIGHT = 70;

function applyDagreLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const laidOutNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: laidOutNodes, edges };
}

// ─── Custom App Node ──────────────────────────────────────────────────────────

function AppFlowNode({ data }: { data: { name: string; criticality: string; status: string; type: string } }) {
  const crit = CRITICALITY_COLORS[data.criticality] ?? CRITICALITY_COLORS.LOW;
  const stat = STATUS_COLORS[data.status] ?? STATUS_COLORS.INACTIVE;

  return (
    <div style={{
      width: NODE_WIDTH,
      backgroundColor: '#fff',
      border: `2px solid ${crit.dot}`,
      borderRadius: 10,
      padding: '8px 12px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: crit.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon path={mdiApplicationCog} size={0.75} color={crit.dot} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{data.name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Criticality badge */}
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, backgroundColor: crit.bg, color: crit.text }}>
          {data.criticality}
        </span>
        {/* Status indicator dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: stat.dot }} />
          <span style={{ fontSize: 9, color: stat.text, fontWeight: 600 }}>{data.status.replace('_', ' ')}</span>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { appNode: AppFlowNode };

// ─── Dependency Graph ─────────────────────────────────────────────────────────

function DependencyGraph({ appGraphData }: { appGraphData: { nodes: AppNode[]; edges: AppEdge[] } | undefined }) {
  const router = useRouter();

  const rawNodes = useMemo((): Node[] =>
    (appGraphData?.nodes ?? []).map((n) => ({
      id: n.id,
      type: 'appNode',
      position: { x: 0, y: 0 },
      data: n.data,
    })),
    [appGraphData]
  );

  const rawEdges = useMemo((): Edge[] =>
    (appGraphData?.edges ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      style: { stroke: '#9ca3af', strokeWidth: 1.5 },
      labelStyle: { fontSize: 10, fill: '#6b7280' },
    })),
    [appGraphData]
  );

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    if (rawNodes.length === 0) return { nodes: rawNodes, edges: rawEdges };
    return applyDagreLayout(rawNodes, rawEdges);
  }, [rawNodes, rawEdges]);

  const [nodes, , onNodesChange] = useNodesState(layoutNodes);
  const [edges, , onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    void router.push(`/dashboard/applications/${node.id}`);
  }, [router]);

  if (!appGraphData || appGraphData.nodes.length === 0) {
    return (
      <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>
          <Icon path={mdiApplicationCog} size={2} color="currentColor" />
          <p style={{ margin: '8px 0 0', fontSize: 14 }}>No applications with dependencies yet</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: 420, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        attributionPosition="bottom-right"
      >
        <Background gap={16} color="#f3f4f6" />
        <Controls />
        <MiniMap nodeColor={(n) => {
          const crit = (n.data as { criticality?: string }).criticality ?? 'LOW';
          return CRITICALITY_COLORS[crit]?.dot ?? '#9ca3af';
        }} />
      </ReactFlow>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, bg, color }: { label: string; value: string | number; icon: string; bg: string; color: string }) {
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon path={icon} size={1.1} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCriticality, setFilterCriticality] = useState('');
  const [sortBy, setSortBy] = useState<'criticality' | 'status' | 'name'>('criticality');

  const { data: statsData, isLoading: statsLoading } = useQuery<AppStats>({
    queryKey: ['app-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/applications/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load stats');
      return res.json() as Promise<AppStats>;
    },
  });

  const { data: graphData, isLoading: graphLoading } = useQuery<{ nodes: AppNode[]; edges: AppEdge[] }>({
    queryKey: ['app-graph'],
    queryFn: async () => {
      const res = await fetch('/api/v1/applications/graph', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load graph');
      return res.json() as Promise<{ nodes: AppNode[]; edges: AppEdge[] }>;
    },
  });

  const params = new URLSearchParams({ pageSize: '100' });
  if (filterType) params.set('type', filterType);
  if (filterStatus) params.set('status', filterStatus);
  if (filterCriticality) params.set('criticality', filterCriticality);

  const { data: listData, isLoading: listLoading, refetch } = useQuery<{ applications: AppListItem[]; total: number }>({
    queryKey: ['applications-list', filterType, filterStatus, filterCriticality],
    queryFn: async () => {
      const res = await fetch(`/api/v1/applications?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load applications');
      return res.json() as Promise<{ applications: AppListItem[]; total: number }>;
    },
  });

  const applications = useMemo(() => {
    const apps = listData?.applications ?? [];
    const critOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const statOrder: Record<string, number> = { ACTIVE: 0, IN_DEVELOPMENT: 1, INACTIVE: 2, DEPRECATED: 3, DECOMMISSIONED: 4 };
    return [...apps].sort((a, b) => {
      if (sortBy === 'criticality') return (critOrder[a.criticality] ?? 9) - (critOrder[b.criticality] ?? 9);
      if (sortBy === 'status') return (statOrder[a.status] ?? 9) - (statOrder[b.status] ?? 9);
      return a.name.localeCompare(b.name);
    });
  }, [listData, sortBy]);

  const stats = statsData;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <Icon path={mdiApplicationCog} size={1.1} color="#4f46e5" />
          Application Portfolio
        </h1>
        <button
          onClick={() => void refetch()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}
        >
          <Icon path={mdiRefresh} size={0.8} color="currentColor" />
          Refresh
        </button>
        <button
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          <Icon path={mdiPlus} size={0.8} color="currentColor" />
          New Application
        </button>
      </div>

      {/* Section 1: Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, height: 76 }} />
          ))
        ) : (
          <>
            <StatCard
              label="Total Applications"
              value={stats?.total ?? 0}
              icon={mdiApplicationCog}
              bg="#eef2ff"
              color="#4f46e5"
            />
            <StatCard
              label="Critical Applications"
              value={stats?.byCriticality?.CRITICAL ?? 0}
              icon={mdiAlertOctagon}
              bg="#fee2e2"
              color="#dc2626"
            />
            <StatCard
              label="Deprecated / Decommissioned"
              value={stats?.deprecatedCount ?? 0}
              icon={mdiArchive}
              bg="#fdf4ff"
              color="#a855f7"
            />
            <StatCard
              label="Total Annual Cost"
              value={stats?.totalAnnualCost ? formatCurrency(stats.totalAnnualCost) : '$0'}
              icon={mdiCurrencyUsd}
              bg="#f0fdf4"
              color="#059669"
            />
          </>
        )}
      </div>

      {/* Section 2: Dependency Graph */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 28 }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#111827' }}>Application Dependency Diagram</h2>
        {graphLoading ? (
          <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', borderRadius: 10 }}>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>Loading dependency graph...</span>
          </div>
        ) : (
          <ReactFlowProvider>
            <DependencyGraph appGraphData={graphData} />
          </ReactFlowProvider>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Click a node to view application details. Node border color = criticality. Dot color = status.
        </p>
      </div>

      {/* Section 3: Criticality/Status Matrix Table */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827', flex: 1 }}>
            Application Matrix
            {listData && <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#6b7280' }}>({listData.total} total)</span>}
          </h2>

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Icon path={mdiFilter} size={0.75} color="#9ca3af" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, outline: 'none' }}
            >
              <option value="">All Types</option>
              {['BUSINESS', 'INFRASTRUCTURE', 'UTILITY', 'MIDDLEWARE', 'DATABASE', 'DEVELOPMENT', 'SECURITY', 'ANALYTICS', 'INTEGRATION'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, outline: 'none' }}
            >
              <option value="">All Statuses</option>
              {Object.keys(STATUS_COLORS).map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <select
              value={filterCriticality}
              onChange={(e) => setFilterCriticality(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, outline: 'none' }}
            >
              <option value="">All Criticality</option>
              {Object.keys(CRITICALITY_COLORS).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'criticality' | 'status' | 'name')}
              style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, outline: 'none' }}
            >
              <option value="criticality">Sort: Criticality</option>
              <option value="status">Sort: Status</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
        </div>

        {listLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading applications...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Type</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Status</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Criticality</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Hosting</th>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Lifecycle</th>
                <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Annual Cost</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const crit = CRITICALITY_COLORS[app.criticality] ?? CRITICALITY_COLORS.LOW;
                const stat = STATUS_COLORS[app.status] ?? STATUS_COLORS.INACTIVE;
                return (
                  <tr
                    key={app.id}
                    onClick={() => { window.location.href = `/dashboard/applications/${app.id}`; }}
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: '#111827' }}>{app.name}</td>
                    <td style={{ padding: '9px 14px', color: '#6b7280' }}>{app.type}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: stat.bg, color: stat.text, whiteSpace: 'nowrap' }}>
                        {app.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: crit.bg, color: crit.text }}>
                        {app.criticality}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', color: '#6b7280' }}>{app.hostingModel ?? '—'}</td>
                    <td style={{ padding: '9px 14px', color: '#6b7280' }}>{app.lifecycleStage ?? '—'}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', color: '#374151' }}>
                      {app.annualCost != null ? formatCurrency(app.annualCost) : '—'}
                    </td>
                  </tr>
                );
              })}
              {applications.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No applications found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
