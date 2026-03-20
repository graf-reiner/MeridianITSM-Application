'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface RevenueChartProps {
  data: Array<{ date: string; mrr: number; arr: number }>;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function RevenueChart({ data }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCurrency}
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value: unknown, name: unknown) => [
            formatCurrency(typeof value === 'number' ? value : 0),
            name === 'mrr' ? 'MRR' : 'ARR',
          ]}
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
          }}
        />
        <Legend
          formatter={(value: string) => (value === 'mrr' ? 'MRR' : 'ARR')}
        />
        <Line
          type="monotone"
          dataKey="mrr"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          name="mrr"
        />
        <Line
          type="monotone"
          dataKey="arr"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={false}
          name="arr"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
