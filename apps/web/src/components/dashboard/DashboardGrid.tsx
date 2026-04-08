'use client';

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import GridLayout, { type Layout, verticalCompactor } from 'react-grid-layout';
import type { WidgetConfig, DashboardConfig, WidgetProps } from './types';
import { WIDGET_TYPE_MAP } from './widget-registry';
import {
  StatCardWidget,
  TicketVolumeWidget,
  PriorityChartWidget,
  CategoryChartWidget,
  RecentActivityWidget,
  MyTicketsWidget,
  UnassignedTicketsWidget,
  SlaStatusWidget,
  QuickActionsWidget,
  WelcomeWidget,
  LinksWidget,
} from './widgets';

// ─── Widget Component Map ────────────────────────────────────────────────────

const WIDGET_COMPONENTS: Record<string, React.ComponentType<WidgetProps>> = {
  stat_card: StatCardWidget,
  ticket_volume_chart: TicketVolumeWidget,
  priority_chart: PriorityChartWidget,
  category_chart: CategoryChartWidget,
  recent_activity: RecentActivityWidget,
  my_tickets: MyTicketsWidget,
  unassigned_tickets: UnassignedTicketsWidget,
  sla_status: SlaStatusWidget,
  quick_actions: QuickActionsWidget,
  welcome: WelcomeWidget,
  links: LinksWidget,
};

// ─── Grid Layout CSS (embedded because Next.js App Router doesn't easily import CSS from node_modules) ──

const GRID_STYLES = `
.react-grid-layout {
  position: relative;
  transition: height 200ms ease;
}
.react-grid-item {
  transition: all 200ms ease;
  transition-property: left, top, width, height;
}
.react-grid-item.cssTransforms {
  transition-property: transform, width, height;
}
.react-grid-item.resizing {
  opacity: 0.9;
  z-index: 1;
  will-change: width, height;
}
.react-grid-item.react-draggable-dragging {
  transition: none;
  z-index: 3;
  will-change: transform;
  opacity: 0.8;
}
.react-grid-item > .react-resizable-handle {
  position: absolute;
  width: 20px;
  height: 20px;
}
.react-grid-item > .react-resizable-handle::after {
  content: "";
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 5px;
  height: 5px;
  border-right: 2px solid rgba(0, 0, 0, 0.3);
  border-bottom: 2px solid rgba(0, 0, 0, 0.3);
}
.react-grid-item > .react-resizable-handle.react-resizable-handle-se {
  bottom: 0;
  right: 0;
  cursor: se-resize;
}
.react-grid-placeholder {
  background: var(--accent-primary);
  opacity: 0.15;
  border-radius: 12px;
  transition-duration: 100ms;
  z-index: 2;
  user-select: none;
}
`;

// ─── Row height constant ─────────────────────────────────────────────────────

const ROW_HEIGHT = 60;
const COLS = 12;
const MARGIN: readonly [number, number] = [16, 16];

// ─── Props ───────────────────────────────────────────────────────────────────

interface DashboardGridProps {
  config: DashboardConfig;
  isEditing: boolean;
  onConfigChange: (config: DashboardConfig) => void;
}

export default function DashboardGrid({ config, isEditing, onConfigChange }: DashboardGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Measure container width for responsive grid
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => setContainerWidth(el.offsetWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Handle layout changes from drag/resize
  const handleLayoutChange = useCallback((newLayout: Layout) => {
    if (!isEditing) return;
    onConfigChange({ ...config, layout: [...newLayout] });
  }, [config, isEditing, onConfigChange]);

  // Handle widget config changes (including removal)
  const handleWidgetConfigChange = useCallback((widgetId: string, widgetConfig: WidgetConfig) => {
    if (widgetConfig.type === '__remove__') {
      // Remove widget
      const newWidgets = { ...config.widgets };
      delete newWidgets[widgetId];
      const newLayout = config.layout.filter(l => l.i !== widgetId);
      onConfigChange({ ...config, widgets: newWidgets, layout: newLayout });
      return;
    }
    onConfigChange({
      ...config,
      widgets: { ...config.widgets, [widgetId]: widgetConfig },
    });
  }, [config, onConfigChange]);

  // Build layout items with min constraints from registry
  const layoutWithConstraints: Layout = useMemo(() => {
    return config.layout.map(item => {
      const widgetConfig = config.widgets[item.i];
      const typeDef = widgetConfig ? WIDGET_TYPE_MAP.get(widgetConfig.type) : null;
      return {
        ...item,
        minW: item.minW ?? typeDef?.minW ?? 2,
        minH: item.minH ?? typeDef?.minH ?? 2,
      };
    });
  }, [config.layout, config.widgets]);

  // Grid config for react-grid-layout v2
  const gridConfig = useMemo(() => ({
    cols: COLS,
    rowHeight: ROW_HEIGHT,
    margin: MARGIN,
    containerPadding: null as readonly [number, number] | null,
    maxRows: Infinity,
  }), []);

  // Drag config - only enabled in edit mode
  const dragConfig = useMemo(() => ({
    enabled: isEditing,
    bounded: false,
    handle: '.drag-handle',
    threshold: 3,
  }), [isEditing]);

  // Resize config - only enabled in edit mode
  const resizeConfig = useMemo(() => ({
    enabled: isEditing,
    handles: ['se'] as const,
  }), [isEditing]);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <style>{GRID_STYLES}</style>
      <GridLayout
        layout={layoutWithConstraints}
        width={containerWidth}
        gridConfig={gridConfig}
        dragConfig={dragConfig}
        resizeConfig={resizeConfig}
        compactor={verticalCompactor}
        onLayoutChange={handleLayoutChange}
        autoSize
      >
        {config.layout.map(item => {
          const widgetConfig = config.widgets[item.i];
          if (!widgetConfig) return null;

          const WidgetComponent = WIDGET_COMPONENTS[widgetConfig.type];
          if (!WidgetComponent) {
            return (
              <div key={item.i}>
                <div style={{
                  height: '100%',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}>
                  Unknown widget: {widgetConfig.type}
                </div>
              </div>
            );
          }

          return (
            <div key={item.i}>
              <WidgetComponent
                widgetId={item.i}
                config={widgetConfig}
                isEditing={isEditing}
                onConfigChange={handleWidgetConfigChange}
              />
            </div>
          );
        })}
      </GridLayout>
    </div>
  );
}
