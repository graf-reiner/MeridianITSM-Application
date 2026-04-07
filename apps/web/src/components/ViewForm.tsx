'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiPlus, mdiClose, mdiArrowUp, mdiArrowDown } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilterRow {
  id: string;
  field: string;
  value: string;
}

interface ViewFormData {
  name: string;
  description: string;
  filters: Record<string, unknown>;
  sortBy: string;
  sortDir: string;
  displayConfig: {
    textColor: string;
    bgColor: string;
    columns: string[];
  };
  isDefault: boolean;
  isGlobal: boolean;
  assignments: Array<{ userId?: string; userGroupId?: string }>;
}

interface ViewFormProps {
  initialData?: ViewFormData & { id?: string };
  mode: 'create' | 'edit';
  isAdmin: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_FIELDS = [
  { key: 'status', label: 'Status', type: 'enum', options: ['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING', 'PENDING_APPROVAL', 'RESOLVED', 'CLOSED', 'CANCELLED'] },
  { key: 'priority', label: 'Priority', type: 'enum', options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
  { key: 'type', label: 'Type', type: 'enum', options: ['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM'] },
  { key: 'source', label: 'Source', type: 'enum', options: ['PORTAL', 'EMAIL', 'AGENT', 'RECURRING', 'API'] },
  { key: 'assignedToId', label: 'Assignee', type: 'entity', endpoint: '/api/v1/settings/users?isActive=true&pageSize=200' },
  { key: 'assignedGroupId', label: 'Assigned Group', type: 'entity', endpoint: '/api/v1/settings/groups' },
  { key: 'requestedById', label: 'Requester', type: 'entity', endpoint: '/api/v1/settings/users?isActive=true&pageSize=200' },
  { key: 'queueId', label: 'Queue', type: 'entity', endpoint: '/api/v1/settings/queues' },
  { key: 'categoryId', label: 'Category', type: 'entity', endpoint: '/api/v1/settings/categories' },
  { key: 'slaId', label: 'SLA Policy', type: 'entity', endpoint: '/api/v1/sla' },
  { key: 'tags', label: 'Tags', type: 'text' },
  { key: 'search', label: 'Search Text', type: 'text' },
  { key: 'dateFrom', label: 'Created After', type: 'date' },
  { key: 'dateTo', label: 'Created Before', type: 'date' },
  { key: 'updatedFrom', label: 'Updated After', type: 'date' },
  { key: 'updatedTo', label: 'Updated Before', type: 'date' },
  { key: 'resolvedFrom', label: 'Resolved After', type: 'date' },
  { key: 'resolvedTo', label: 'Resolved Before', type: 'date' },
  { key: 'closedFrom', label: 'Closed After', type: 'date' },
  { key: 'closedTo', label: 'Closed Before', type: 'date' },
];

const SORT_FIELDS = [
  { key: 'createdAt', label: 'Created Date' },
  { key: 'updatedAt', label: 'Updated Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'title', label: 'Title' },
  { key: 'ticketNumber', label: 'Ticket Number' },
  { key: 'resolvedAt', label: 'Resolved Date' },
  { key: 'closedAt', label: 'Closed Date' },
  { key: 'type', label: 'Type' },
  { key: 'source', label: 'Source' },
];

const ALL_COLUMNS = [
  { key: 'ticketNumber', label: 'Number' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'type', label: 'Type' },
  { key: 'assignedTo', label: 'Assignee' },
  { key: 'assignedGroup', label: 'Group' },
  { key: 'requestedBy', label: 'Requester' },
  { key: 'queue', label: 'Queue' },
  { key: 'category', label: 'Category' },
  { key: 'source', label: 'Source' },
  { key: 'tags', label: 'Tags' },
  { key: 'createdAt', label: 'Created' },
  { key: 'updatedAt', label: 'Updated' },
  { key: 'sla', label: 'SLA' },
];

const DEFAULT_COLUMNS = ['ticketNumber', 'title', 'status', 'priority', 'assignedTo', 'category', 'source', 'createdAt', 'sla'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

let nextFilterId = 1;
function genFilterId() { return `f-${nextFilterId++}`; }

function filtersToRows(filters: Record<string, unknown>): FilterRow[] {
  const rows: FilterRow[] = [];
  for (const [field, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      rows.push({ id: genFilterId(), field, value: String(value) });
    }
  }
  return rows.length > 0 ? rows : [{ id: genFilterId(), field: '', value: '' }];
}

function rowsToFilters(rows: FilterRow[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.field && row.value) {
      result[row.field] = row.value;
    }
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ViewForm({ initialData, mode, isAdmin }: ViewFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [filterRows, setFilterRows] = useState<FilterRow[]>(
    initialData?.filters ? filtersToRows(initialData.filters as Record<string, unknown>) : [{ id: genFilterId(), field: '', value: '' }]
  );
  const [sortBy, setSortBy] = useState(initialData?.sortBy ?? 'createdAt');
  const [sortDir, setSortDir] = useState(initialData?.sortDir ?? 'desc');
  const [columns, setColumns] = useState<string[]>(initialData?.displayConfig?.columns ?? DEFAULT_COLUMNS);
  const [textColor, setTextColor] = useState(initialData?.displayConfig?.textColor ?? '');
  const [bgColor, setBgColor] = useState(initialData?.displayConfig?.bgColor ?? '');
  const [isDefault, setIsDefault] = useState(initialData?.isDefault ?? false);
  const [isGlobal, setIsGlobal] = useState(initialData?.isGlobal ?? false);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>(
    initialData?.assignments?.filter(a => a.userId).map(a => a.userId!) ?? []
  );
  const [assignedGroupIds, setAssignedGroupIds] = useState<string[]>(
    initialData?.assignments?.filter(a => a.userGroupId).map(a => a.userGroupId!) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load entity options for filter dropdowns
  const { data: usersData = [] } = useQuery<Array<{ id: string; firstName: string; lastName: string; email: string }>>({
    queryKey: ['users-for-views'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/users?isActive=true&pageSize=200', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? json.users ?? (Array.isArray(json) ? json : []);
    },
  });

  const { data: groupsData = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['groups-for-views'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/groups', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.groups ?? [];
    },
  });

  const { data: queuesData = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['queues-for-views'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.queues ?? [];
    },
  });

  const { data: categoriesData = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['categories-for-views'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/categories', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.categories ?? [];
    },
  });

  const { data: slasData = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['slas-for-views'],
    queryFn: async () => {
      const res = await fetch('/api/v1/sla', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  function getEntityOptions(endpoint: string): Array<{ id: string; label: string }> {
    if (endpoint.includes('/users')) return usersData.map(u => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));
    if (endpoint.includes('/groups')) return groupsData.map(g => ({ id: g.id, label: g.name }));
    if (endpoint.includes('/queues')) return queuesData.map(q => ({ id: q.id, label: q.name }));
    if (endpoint.includes('/categories')) return categoriesData.map(c => ({ id: c.id, label: c.name }));
    if (endpoint.includes('/sla')) return slasData.map(s => ({ id: s.id, label: s.name }));
    return [];
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      filters: rowsToFilters(filterRows),
      sortBy,
      sortDir,
      displayConfig: {
        textColor: textColor || undefined,
        bgColor: bgColor || undefined,
        columns,
      },
      isDefault,
      isGlobal: isAdmin ? isGlobal : undefined,
      assignments: isAdmin ? [
        ...assignedUserIds.map(id => ({ userId: id })),
        ...assignedGroupIds.map(id => ({ userGroupId: id })),
      ] : undefined,
    };

    try {
      const url = mode === 'edit' && initialData?.id
        ? `/api/v1/tickets/views/${initialData.id}`
        : '/api/v1/tickets/views';
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save view');
      }
      router.push('/dashboard/tickets');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addFilterRow = () => setFilterRows(prev => [...prev, { id: genFilterId(), field: '', value: '' }]);
  const removeFilterRow = (id: string) => setFilterRows(prev => prev.filter(r => r.id !== id));
  const updateFilterRow = (id: string, updates: Partial<FilterRow>) => {
    setFilterRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const toggleColumn = (key: string) => {
    setColumns(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, backgroundColor: 'var(--bg-primary)' };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };
  const sectionStyle = { backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20, marginBottom: 16 };
  const sectionTitle = { margin: '0 0 14px', fontSize: 15, fontWeight: 700 as const, color: 'var(--text-primary)' };

  return (
    <div>
      {/* Section 1: Basic Info */}
      <div style={sectionStyle}>
        <h3 style={sectionTitle}>Basic Info</h3>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>View Name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Open P1 Tickets" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
      </div>

      {/* Section 2: Filters */}
      <div style={sectionStyle}>
        <h3 style={sectionTitle}>Filter Criteria</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>All filters combine with AND logic.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filterRows.map((row) => {
            const fieldDef = FILTER_FIELDS.find(f => f.key === row.field);
            return (
              <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <select
                  value={row.field}
                  onChange={e => updateFilterRow(row.id, { field: e.target.value, value: '' })}
                  style={{ ...inputStyle, flex: '0 0 200px', width: 'auto' }}
                >
                  <option value="">Select field...</option>
                  {FILTER_FIELDS.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>

                {/* Value input — varies by field type */}
                {fieldDef?.type === 'enum' ? (
                  <select value={row.value} onChange={e => updateFilterRow(row.id, { value: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                    <option value="">Any</option>
                    {fieldDef.options?.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                  </select>
                ) : fieldDef?.type === 'entity' ? (
                  <select value={row.value} onChange={e => updateFilterRow(row.id, { value: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                    <option value="">Any</option>
                    {getEntityOptions(fieldDef.endpoint!).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                ) : fieldDef?.type === 'date' ? (
                  <input type="date" value={row.value} onChange={e => updateFilterRow(row.id, { value: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                ) : (
                  <input type="text" value={row.value} onChange={e => updateFilterRow(row.id, { value: e.target.value })} placeholder={row.field === 'tags' ? 'tag1, tag2, ...' : 'Value...'} style={{ ...inputStyle, flex: 1 }} />
                )}

                <button onClick={() => removeFilterRow(row.id)} style={{ flex: '0 0 32px', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-secondary)', borderRadius: 7, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-placeholder)' }}>
                  <Icon path={mdiClose} size={0.7} color="currentColor" />
                </button>
              </div>
            );
          })}
        </div>
        <button onClick={addFilterRow} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon path={mdiPlus} size={0.65} color="currentColor" /> Add Filter
        </button>
      </div>

      {/* Section 3: Sort Order */}
      <div style={sectionStyle}>
        <h3 style={sectionTitle}>Sort Order</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
              {SORT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Direction</label>
            <select value={sortDir} onChange={e => setSortDir(e.target.value)} style={inputStyle}>
              <option value="desc">Descending (newest first)</option>
              <option value="asc">Ascending (oldest first)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 4: Display Customization */}
      <div style={sectionStyle}>
        <h3 style={sectionTitle}>Display Customization</h3>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Text Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={textColor || '#000000'} onChange={e => setTextColor(e.target.value)} style={{ width: 36, height: 36, border: '1px solid var(--border-secondary)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
              <input type="text" value={textColor} onChange={e => setTextColor(e.target.value)} placeholder="#000000" style={{ ...inputStyle, width: 100 }} />
              {textColor && <button onClick={() => setTextColor('')} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Row Background Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={bgColor || '#ffffff'} onChange={e => setBgColor(e.target.value)} style={{ width: 36, height: 36, border: '1px solid var(--border-secondary)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
              <input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)} placeholder="#ffffff" style={{ ...inputStyle, width: 100 }} />
              {bgColor && <button onClick={() => setBgColor('')} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>}
            </div>
          </div>
        </div>

        <label style={labelStyle}>Visible Columns</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ALL_COLUMNS.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-secondary)', backgroundColor: columns.includes(col.key) ? 'var(--badge-blue-bg)' : 'var(--bg-primary)' }}>
              <input type="checkbox" checked={columns.includes(col.key)} onChange={() => toggleColumn(col.key)} style={{ cursor: 'pointer' }} />
              {col.label}
            </label>
          ))}
        </div>
      </div>

      {/* Section 5: Sharing (admin only) */}
      {isAdmin && (
        <div style={sectionStyle}>
          <h3 style={sectionTitle}>Sharing</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 14 }}>
            <input type="checkbox" checked={isGlobal} onChange={e => setIsGlobal(e.target.checked)} />
            <span style={{ fontWeight: 500 }}>Global — visible to all agents in this tenant</span>
          </label>

          {!isGlobal && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Assign to Users</label>
                <select
                  onChange={e => { if (e.target.value && !assignedUserIds.includes(e.target.value)) setAssignedUserIds(prev => [...prev, e.target.value]); e.target.value = ''; }}
                  style={inputStyle}
                >
                  <option value="">+ Add user...</option>
                  {usersData.filter(u => !assignedUserIds.includes(u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
                  ))}
                </select>
                {assignedUserIds.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {assignedUserIds.map(uid => {
                      const u = usersData.find(u => u.id === uid);
                      return (
                        <span key={uid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, fontSize: 12, backgroundColor: 'var(--badge-blue-bg)', color: 'var(--accent-primary)' }}>
                          {u ? `${u.firstName} ${u.lastName}` : uid}
                          <button onClick={() => setAssignedUserIds(prev => prev.filter(id => id !== uid))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent-primary)' }}>
                            <Icon path={mdiClose} size={0.5} color="currentColor" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Assign to Groups</label>
                <select
                  onChange={e => { if (e.target.value && !assignedGroupIds.includes(e.target.value)) setAssignedGroupIds(prev => [...prev, e.target.value]); e.target.value = ''; }}
                  style={inputStyle}
                >
                  <option value="">+ Add group...</option>
                  {groupsData.filter(g => !assignedGroupIds.includes(g.id)).map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {assignedGroupIds.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {assignedGroupIds.map(gid => {
                      const g = groupsData.find(g => g.id === gid);
                      return (
                        <span key={gid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, fontSize: 12, backgroundColor: 'var(--badge-green-bg)', color: '#065f46' }}>
                          {g?.name ?? gid}
                          <button onClick={() => setAssignedGroupIds(prev => prev.filter(id => id !== gid))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#065f46' }}>
                            <Icon path={mdiClose} size={0.5} color="currentColor" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Section 6: Preferences + Export/Import */}
      <div style={sectionStyle}>
        <h3 style={sectionTitle}>Preferences</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>
          <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
          <span style={{ fontWeight: 500 }}>Set as my default view</span>
        </label>

        <div style={{ borderTop: '1px solid var(--bg-tertiary)', paddingTop: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Export / Import</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            {mode === 'edit' && initialData?.id && (
              <button
                onClick={async () => {
                  const res = await fetch(`/api/v1/tickets/views/${initialData.id}/export`, { credentials: 'include' });
                  if (!res.ok) return;
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `view-${name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
              >
                Export JSON
              </button>
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
              Import JSON
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const config = JSON.parse(text);
                    const res = await fetch('/api/v1/tickets/views/import', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                      body: JSON.stringify({ config }),
                    });
                    if (!res.ok) throw new Error('Import failed');
                    const data = await res.json();
                    if (data.warnings?.length) {
                      alert(`View imported with warnings:\n${data.warnings.join('\n')}`);
                    } else {
                      alert('View imported successfully!');
                    }
                    router.push('/dashboard/tickets');
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Failed to import view');
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Error + Actions */}
      {error && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, color: '#dc2626', fontSize: 14 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => router.push('/dashboard/tickets')}
          style={{ padding: '10px 20px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          style={{ padding: '10px 24px', backgroundColor: saving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Create View'}
        </button>
      </div>
    </div>
  );
}
