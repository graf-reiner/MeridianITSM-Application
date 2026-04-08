export interface WidgetLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface WidgetConfig {
  type: string;
  title?: string;
  config?: Record<string, unknown>;
}

export interface DashboardConfig {
  layout: WidgetLayout[];
  widgets: Record<string, WidgetConfig>;
  background: { type: 'color' | 'gradient' | 'image'; value: string } | null;
}

export interface WidgetProps {
  widgetId: string;
  config: WidgetConfig;
  isEditing: boolean;
  onConfigChange?: (widgetId: string, config: WidgetConfig) => void;
}

export interface WidgetTypeDefinition {
  type: string;
  label: string;
  description: string;
  icon: string;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
}
