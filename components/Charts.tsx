'use client';

import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';

const INK = '#111111', SUB = '#6d675c', RULE = '#d8d1c3', VOLT = '#d7ff3a';
const axis = { stroke: SUB, fontSize: 11, tickLine: false, axisLine: false, fontFamily: 'Barlow Condensed', fontWeight: 600 } as const;
const tip = {
  contentStyle: { background: INK, border: 0, borderRadius: 0, fontSize: 13, color: '#f4f1ea', fontFamily: 'Archivo Variable' },
  labelStyle: { color: VOLT, fontFamily: 'Barlow Condensed', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em' },
  itemStyle: { color: '#f4f1ea' },
};

/** Primary series drawn in ink over a volt area; optional secondary series dashed. */
export function TrendChart({ data, main, secondary, unit = 'kg', height = 220 }: {
  data: Record<string, number | string>[]; main: { key: string; name: string }; secondary?: { key: string; name: string }; unit?: string; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={RULE} vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={28} />
        <YAxis {...axis} domain={['auto', 'auto']} width={44} />
        <Tooltip {...tip} formatter={(v, n) => [`${v} ${unit}`, n]} cursor={{ stroke: INK, strokeWidth: 1 }} />
        <Area type="monotone" dataKey={main.key} name={main.name} stroke="none" fill={VOLT} fillOpacity={0.9} baseValue="dataMin" />
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
      <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid stroke={RULE} vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} allowDecimals={false} width={40} />
        <Tooltip {...tip} cursor={{ fill: '#11111110' }} formatter={(v) => [`${v}${unit}`, '']} />
        <Bar dataKey={dataKey} radius={0}>
          {data.map((_, i) => <Cell key={i} fill={i === data.length - 1 ? VOLT : INK} stroke={INK} strokeWidth={i === data.length - 1 ? 2 : 0} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
