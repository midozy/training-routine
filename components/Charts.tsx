'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from 'recharts';

const axis = { stroke: '#8b94a1', fontSize: 11, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { background: '#15181d', border: '1px solid #252a31', borderRadius: 12, fontSize: 12 }, labelStyle: { color: '#8b94a1' } };

export function TrendChart({ data, lines, unit = 'kg', height = 220 }: {
  data: Record<string, number | string>[]; lines: { key: string; name: string; color: string; dashed?: boolean }[]; unit?: string; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#252a31" vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={24} />
        <YAxis {...axis} domain={['auto', 'auto']} unit={unit === 'kg' ? '' : unit} />
        <Tooltip {...tip} formatter={(v) => [`${v} ${unit}`]} />
        {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2}
            strokeDasharray={l.dashed ? '4 4' : undefined} dot={{ r: 2.5, fill: l.color }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StackedBars({ data, keys, colors, height = 240 }: {
  data: Record<string, number | string>[]; keys: string[]; colors: Record<string, string>; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#252a31" vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tip} cursor={{ fill: '#ffffff08' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k) => <Bar key={k} dataKey={k} stackId="a" fill={colors[k]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
