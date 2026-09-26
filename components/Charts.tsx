'use client';

import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';

// Theme-aware: every colour is a CSS variable, so charts follow light/dark mode.
const INK = 'var(--ink)', SUB = 'var(--sub)', RULE = 'var(--rule)', VOLT = 'var(--volt)', CARD = 'var(--card)';
const axis = { stroke: SUB, fontSize: 11, tickLine: false, axisLine: false, fontFamily: 'Barlow Condensed', fontWeight: 600 } as const;
const tip = {
  contentStyle: { background: 'var(--inv)', border: 0, borderRadius: 12, fontSize: 13, color: 'var(--on-inv)', boxShadow: '0 6px 20px rgb(0 0 0 / .18)' },
  labelStyle: { color: '#d7ff3a', fontFamily: 'Barlow Condensed', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.06em' },
  itemStyle: { color: 'var(--on-inv)' },
};

/** Primary series drawn in ink over a volt area; optional secondary series dashed. */
export function TrendChart({ data, main, secondary, unit = 'kg', height = 220 }: {
  data: Record<string, number | string>[]; main: { key: string; name: string }; secondary?: { key: string; name: string }; unit?: string; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 6, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${main.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VOLT} stopOpacity={0.95} />
            <stop offset="100%" stopColor={VOLT} stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={RULE} vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={28} />
        <YAxis {...axis} domain={["auto", "auto"]} width={46} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10))} />
        <Tooltip {...tip} formatter={(v, n) => [`${v} ${unit}`, n]} cursor={{ stroke: SUB, strokeWidth: 1 }} />
        <Area type="monotone" dataKey={main.key} name={main.name} stroke="none" fill={`url(#g-${main.key})`} baseValue="dataMin" />
        {secondary && <Line type="monotone" dataKey={secondary.key} name={secondary.name} stroke={SUB} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />}
        <Line type="monotone" dataKey={main.key} name={main.name} stroke={INK} strokeWidth={2.5} dot={{ r: 3, fill: INK, stroke: INK }} activeDot={{ r: 5, fill: VOLT, stroke: INK, strokeWidth: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Column chart; the last column is highlighted in volt. */
export function Columns({ data, dataKey, height = 180, unit = '' }: { data: Record<string, number | string>[]; dataKey: string; height?: number; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}>
        <CartesianGrid stroke={RULE} vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} allowDecimals={false} width={40} />
        <Tooltip {...tip} cursor={{ fill: 'var(--card2)' }} formatter={(v) => [`${v}${unit}`, '']} />
        <Bar dataKey={dataKey} radius={[6, 6, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={i === data.length - 1 ? VOLT : INK} stroke={i === data.length - 1 ? INK : CARD} strokeWidth={i === data.length - 1 ? 1.5 : 0} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
