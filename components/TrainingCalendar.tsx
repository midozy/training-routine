'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { byDay, intensity, localDate, monthGrid, monthTotals, shiftMonth, weekdayLabels, type WeekStart } from '@/lib/calendar';

type Item = { id: number; started_at: string; day_name: string; sets: number; minutes: number | null; finished_at: string | null };

const FILL = ['', 'bg-volt/35', 'bg-volt/70', 'bg-volt']; // light / solid / big training day
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Month calendar of the days you trained, shaded by working sets. Tap a day to see its workouts. */
export default function TrainingCalendar({ rows, weekStart }: { rows: Item[]; weekStart: WeekStart }) {
  const now = new Date();
  const today = localDate(now);
  const [view, setView] = useState({ year: now.getFullYear(), month0: now.getMonth() });
  const [picked, setPicked] = useState<string>(today);
  const days = useMemo(() => byDay(rows), [rows]);
  const grid = monthGrid(view.year, view.month0, weekStart);
  const totals = monthTotals(days, view.year, view.month0);
  const title = new Date(view.year, view.month0, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const monthLong = new Date(view.year, view.month0, 1).toLocaleDateString('en-GB', { month: 'long' });
  const isCurrent = view.year === now.getFullYear() && view.month0 === now.getMonth();
  const pickedRows = rows.filter((r) => r.sets > 0 && localDate(new Date(r.started_at)) === picked);
  const pickedTitle = new Date(`${picked}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const go = (by: number) => setView((v) => shiftMonth(v.year, v.month0, by));

  return (
    <section className="card p-4 mb-6" aria-label="Training calendar">
      <div className="flex items-center justify-between">
        <button className="w-11 h-11 -ml-2 grid place-items-center text-ink" aria-label="Previous month" onClick={() => go(-1)}><span className="rotate-90 inline-block"><Icon name="down" size={18} /></span></button>
        <div className="text-center">
          <div className="display text-[26px] leading-none">{title}</div>
          <div className="text-[13px] text-sub mt-1">{totals.workouts ? `${plural(totals.workouts, 'workout')} · ${plural(totals.activeDays, 'day')} · ${totals.sets} sets` : 'No workouts'}</div>
        </div>
        <button className="w-11 h-11 -mr-2 grid place-items-center text-ink" aria-label="Next month" onClick={() => go(1)}><span className="-rotate-90 inline-block"><Icon name="down" size={18} /></span></button>
      </div>

      <div className="grid grid-cols-7 gap-1 mt-3 text-center">
        {weekdayLabels(weekStart).map((l, i) => <div key={i} className="eyebrow !text-[11px]">{l}</div>)}
        {grid.flat().map((c) => {
          if (!c.inMonth) return <div key={c.date} aria-hidden="true" className="h-11" />;
          const d = days[c.date];
          const level = d ? intensity(d.sets) : 0;
          const label = `${c.day} ${monthLong} ${view.year}, ${d ? `${plural(d.workouts, 'workout')}, ${d.sets} sets` : 'rest day'}`;
          return (
            <button key={c.date} aria-label={label} aria-pressed={picked === c.date} onClick={() => setPicked(c.date)}
              className={`h-11 rounded-xl grid place-items-center num text-[17px] ${FILL[level]} ${level ? 'text-[#111]' : 'text-ink'} ${picked === c.date ? 'ring-2 ring-ink' : ''} ${c.date === today ? 'underline decoration-2 underline-offset-4' : ''}`}>
              {c.day}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-sub" aria-hidden="true">
          <span>Less</span>{[1, 2, 3].map((l) => <span key={l} className={`w-4 h-4 rounded ${FILL[l]}`} />)}<span>More</span>
        </div>
        {!isCurrent && <button className="text-[13px] font-semibold text-ink h-9 px-2" onClick={() => { setView({ year: now.getFullYear(), month0: now.getMonth() }); setPicked(today); }}>Today</button>}
      </div>

      <div className="mt-3 pt-3 border-t border-rule">
        <div className="eyebrow">{pickedTitle}</div>
        {pickedRows.length === 0 ? (
          <div className="text-[15px] text-sub mt-2">{picked > today ? 'Not yet' : 'Rest day: nothing logged'}</div>
        ) : pickedRows.map((r) => (
          <Link key={r.id} href={`/workout?id=${r.id}`} className="flex items-center gap-3 h-12">
            <span className="flex-1 font-semibold truncate">{r.day_name}</span>
            <span className="text-[13px] text-sub">{r.finished_at ? `${r.minutes} min · ` : ''}{r.sets} sets</span>
            <span className="text-sub">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
