'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiPencilOutline,
  mdiPlus,
  mdiPaletteOutline,
  mdiRefresh,
  mdiCheck,
} from '@mdi/js';
import type { Layout } from 'react-grid-layout';
import type { DashboardConfig, WidgetConfig, WidgetLayout } from '@/components/dashboard/types';
import { WIDGET_TYPE_MAP } from '@/components/dashboard/widget-registry';
import WidgetPalette from '@/components/dashboard/WidgetPalette';
import BackgroundPicker from '@/components/dashboard/BackgroundPicker';

// Widget components
import StatCardWidget from '@/components/dashboard/widgets/StatCardWidget';
import TicketVolumeWidget from '@/components/dashboard/widgets/TicketVolumeWidget';
import PriorityChartWidget from '@/components/dashboard/widgets/PriorityChartWidget';
import CategoryChartWidget from '@/components/dashboard/widgets/CategoryChartWidget';
import RecentActivityWidget from '@/components/dashboard/widgets/RecentActivityWidget';
import MyTicketsWidget from '@/components/dashboard/widgets/MyTicketsWidget';
import UnassignedTicketsWidget from '@/components/dashboard/widgets/UnassignedTicketsWidget';
import SlaStatusWidget from '@/components/dashboard/widgets/SlaStatusWidget';
import QuickActionsWidget from '@/components/dashboard/widgets/QuickActionsWidget';
import WelcomeWidget from '@/components/dashboard/widgets/WelcomeWidget';
import LinksWidget from '@/components/dashboard/widgets/LinksWidget';

// react-grid-layout uses DOM manipulation, must be client-only
// Use legacy import for v1-compatible flat props (cols, rowHeight, isDraggable, etc.)
const GridLayout = dynamic(
  () => import('react-grid-layout/legacy').then((mod) => mod.default || mod.ReactGridLayout),
  { ssr: false },
);

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_LAYOUT: WidgetLayout[] = [
  { i: 'w1', x: 0, y: 0, w: 6, h: 2 },
  { i: 'w2', x: 6, y: 0, w: 3, h: 2 },
  { i: 'w3', x: 9, y: 0, w: 3, h: 2 },
  { i: 'w4', x: 0, y: 2, w: 6, h: 4 },
  { i: 'w5', x: 6, y: 2, w: 6, h: 4 },
  { i: 'w6', x: 0, y: 6, w: 6, h: 4 },
  { i: 'w7', x: 6, y: 6, w: 6, h: 4 },
];

const DEFAULT_WIDGETS: Record<string, WidgetConfig> = {
  w1: { type: 'welcome' },
  w2: { type: 'stat_card', config: { metric: 'openTickets' } },
  w3: { type: 'stat_card', config: { metric: 'overdueTickets' } },
  w4: { type: 'ticket_volume_chart' },
  w5: { type: 'priority_chart' },
  w6: { type: 'recent_activity' },
  w7: { type: 'my_tickets' },
};

const DEFAULT_CONFIG: DashboardConfig = {
  layout: DEFAULT_LAYOUT,
  widgets: DEFAULT_WIDGETS,
  background: null,
};

// ─── Widget renderer ─────────────────────────────────────────────────────────

function renderWidget(
  widgetId: string,
  widgetConfig: WidgetConfig,
  isEditing: boolean,
  onConfigChange: (widgetId: string, config: WidgetConfig) => void,
) {
  const props = { widgetId, config: widgetConfig, isEditing, onConfigChange };
  switch (widgetConfig.type) {
    case 'stat_card': return <StatCardWidget {...props} />;
    case 'ticket_volume_chart': return <TicketVolumeWidget {...props} />;
    case 'priority_chart': return <PriorityChartWidget {...props} />;
    case 'category_chart': return <CategoryChartWidget {...props} />;
    case 'recent_activity': return <RecentActivityWidget {...props} />;
    case 'my_tickets': return <MyTicketsWidget {...props} />;
    case 'unassigned_tickets': return <UnassignedTicketsWidget {...props} />;
    case 'sla_status': return <SlaStatusWidget {...props} />;
    case 'quick_actions': return <QuickActionsWidget {...props} />;
    case 'welcome': return <WelcomeWidget {...props} />;
    case 'links': return <LinksWidget {...props} />;
    default: return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
        Unknown widget: {widgetConfig.type}
      </div>
    );
  }
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);

  // Local state for layout + widgets (editable copy)
  const [localConfig, setLocalConfig] = useState<DashboardConfig | null>(null);

  // Grid container width
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Debounce timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch preferences ────────────────────────────────────────────────────

  const { data: prefData, isLoading } = useQuery<{ dashboardConfig?: DashboardConfig }>({
    queryKey: ['user-preferences-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/v1/preferences', { credentials: 'include' });
      if (!res.ok) return {};
      return res.json() as Promise<{ dashboardConfig?: DashboardConfig }>;
    },
    staleTime: 60_000,
  });

  // Derive the active config (server data -> local overrides -> defaults)
  const dashboardConfig: DashboardConfig = useMemo(() => {
    if (localConfig) return localConfig;
    if (prefData?.dashboardConfig) return prefData.dashboardConfig;
    return DEFAULT_CONFIG;
  }, [localConfig, prefData]);

  // Sync from server when first loaded
  useEffect(() => {
    if (prefData && !localConfig) {
      setLocalConfig(prefData.dashboardConfig || DEFAULT_CONFIG);
    }
  }, [prefData, localConfig]);

  // ── Save mutation ────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (config: DashboardConfig) => {
      const res = await fetch('/api/v1/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dashboardConfig: config }),
      });
      if (!res.ok) throw new Error('Failed to save dashboard');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences-dashboard'] });
    },
  });

  // Debounced save
  const debouncedSave = useCallback((config: DashboardConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMutation.mutate(config);
    }, 1000);
  }, [saveMutation]);

  // ── Update helpers ───────────────────────────────────────────────────────

  const updateConfig = useCallback((updater: (prev: DashboardConfig) => DashboardConfig) => {
    setLocalConfig((prev) => {
      const next = updater(prev || DEFAULT_CONFIG);
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    updateConfig((prev) => ({
      ...prev,
      layout: [...newLayout].map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        minW: l.minW,
        minH: l.minH,
      })),
    }));
  }, [updateConfig]);

  const handleWidgetConfigChange = useCallback((widgetId: string, widgetConfig: WidgetConfig) => {
    if (widgetConfig.type === '__remove__') {
      // Remove widget
      updateConfig((prev) => {
        const { [widgetId]: _, ...remainingWidgets } = prev.widgets;
        return {
          ...prev,
          layout: prev.layout.filter((l) => l.i !== widgetId),
          widgets: remainingWidgets,
        };
      });
      return;
    }
    updateConfig((prev) => ({
      ...prev,
      widgets: { ...prev.widgets, [widgetId]: widgetConfig },
    }));
  }, [updateConfig]);

  const handleAddWidget = useCallback((type: string) => {
    const typeDef = WIDGET_TYPE_MAP.get(type);
    if (!typeDef) return;
    const id = `w_${Date.now()}`;
    updateConfig((prev) => ({
      ...prev,
      layout: [
        ...prev.layout,
        {
          i: id,
          x: 0,
          y: Infinity,
          w: typeDef.defaultW,
          h: typeDef.defaultH,
          minW: typeDef.minW,
          minH: typeDef.minH,
        },
      ],
      widgets: {
        ...prev.widgets,
        [id]: { type },
      },
    }));
  }, [updateConfig]);

  const handleBackgroundSelect = useCallback((bg: DashboardConfig['background']) => {
    updateConfig((prev) => ({ ...prev, background: bg }));
  }, [updateConfig]);

  const handleResetToDefault = useCallback(() => {
    setLocalConfig(DEFAULT_CONFIG);
    debouncedSave(DEFAULT_CONFIG);
  }, [debouncedSave]);

  const handleDoneEditing = useCallback(() => {
    setIsEditing(false);
    // Force an immediate save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (localConfig) saveMutation.mutate(localConfig);
  }, [localConfig, saveMutation]);

  // ── Background style ────────────────────────────────────────────────────

  const bgStyle: React.CSSProperties = useMemo(() => {
    const bg = dashboardConfig.background;
    if (!bg) return {};
    switch (bg.type) {
      case 'color':
        return { backgroundColor: bg.value };
      case 'gradient':
        return { background: bg.value };
      case 'image':
        return {
          backgroundImage: `url(${bg.value})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        };
      default:
        return {};
    }
  }, [dashboardConfig.background]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--text-muted)' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100%',
        borderRadius: 12,
        padding: 0,
        ...bgStyle,
      }}
    >
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 24,
          fontWeight: 700,
          color: dashboardConfig.background ? (
            dashboardConfig.background.type === 'color' &&
            ['#1e293b', '#1f2937', '#0f172a'].includes(dashboardConfig.background.value)
              ? '#fff'
              : 'var(--text-primary)'
          ) : 'var(--text-primary)',
        }}>
          Dashboard
        </h1>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!isEditing ? (
            <ToolbarButton
              icon={mdiPencilOutline}
              label="Customize"
              onClick={() => setIsEditing(true)}
            />
          ) : (
            <>
              <ToolbarButton
                icon={mdiPlus}
                label="Add Widget"
                onClick={() => setPaletteOpen(true)}
              />
              <ToolbarButton
                icon={mdiPaletteOutline}
                label="Background"
                onClick={() => setBgPickerOpen(true)}
              />
              <ToolbarButton
                icon={mdiRefresh}
                label="Reset"
                onClick={handleResetToDefault}
              />
              <ToolbarButton
                icon={mdiCheck}
                label="Done"
                onClick={handleDoneEditing}
                primary
              />
            </>
          )}
        </div>
      </div>

      {/* Grid */}
      {containerWidth > 0 && (
        <GridLayout
          layout={dashboardConfig.layout}
          cols={12}
          rowHeight={60}
          width={containerWidth}
          isDraggable={isEditing}
          isResizable={isEditing}
          draggableHandle=".drag-handle"
          onLayoutChange={handleLayoutChange}
          compactType="vertical"
          margin={[12, 12]}
        >
          {dashboardConfig.layout.map((item) => {
            const widgetConfig = dashboardConfig.widgets[item.i];
            if (!widgetConfig) return <div key={item.i} />;
            return (
              <div key={item.i}>
                {renderWidget(item.i, widgetConfig, isEditing, handleWidgetConfigChange)}
              </div>
            );
          })}
        </GridLayout>
      )}

      {/* Modals */}
      <WidgetPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAdd={handleAddWidget}
      />
      <BackgroundPicker
        isOpen={bgPickerOpen}
        onClose={() => setBgPickerOpen(false)}
        currentBackground={dashboardConfig.background}
        onSelect={handleBackgroundSelect}
      />

      {/* react-grid-layout minimal CSS */}
      <style>{`
        .react-grid-item {
          transition: all 200ms ease;
          transition-property: left, top, width, height;
        }
        .react-grid-item.cssTransforms {
          transition-property: transform, width, height;
        }
        .react-grid-item.resizing {
          z-index: 1;
          will-change: width, height;
          opacity: 0.9;
        }
        .react-grid-item.react-draggable-dragging {
          transition: none;
          z-index: 3;
          will-change: transform;
          opacity: 0.9;
        }
        .react-grid-placeholder {
          background: var(--accent-brand, #0ea5e9);
          opacity: 0.15;
          border-radius: 12px;
          transition-duration: 100ms;
          z-index: 2;
        }
        .react-grid-item > .react-resizable-handle {
          position: absolute;
          width: 20px;
          height: 20px;
          bottom: 0;
          right: 0;
          cursor: se-resize;
        }
        .react-grid-item > .react-resizable-handle::after {
          content: "";
          position: absolute;
          right: 3px;
          bottom: 3px;
          width: 6px;
          height: 6px;
          border-right: 2px solid var(--text-muted, #94a3b8);
          border-bottom: 2px solid var(--text-muted, #94a3b8);
        }
      `}</style>
    </div>
  );
}

// ─── Toolbar Button ──────────────────────────────────────────────────────────

function ToolbarButton({
  icon,
  label,
  onClick,
  primary = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 8,
        border: primary ? 'none' : '1px solid var(--border-primary)',
        backgroundColor: primary ? 'var(--accent-brand)' : 'var(--bg-primary)',
        color: primary ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'background-color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon path={icon} size={0.7} color="currentColor" />
      {label}
    </button>
  );
}
