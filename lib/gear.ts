// Your bar and the plates your gym has, remembered on this phone (per unit). Used by the plate calculator and warm-ups.
export type Unit = 'kg' | 'lb';
export type Gear = { bar: number; plates: number[] };

export const BAR_OPTIONS: Record<Unit, number[]> = { kg: [15, 20], lb: [35, 45] };
export const PLATE_CHOICES: Record<Unit, number[]> = { kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5], lb: [45, 35, 25, 10, 5, 2.5, 1.25] };
export const DEFAULT_GEAR: Record<Unit, Gear> = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
};

const key = (u: Unit) => `heavy.gear.${u}`;

export function loadGear(unit: Unit): Gear {
  try {
    const g = JSON.parse(localStorage.getItem(key(unit)) || 'null') as Gear | null;
    if (g && typeof g.bar === 'number' && Array.isArray(g.plates)) return g;
  } catch { /* use defaults */ }
  return DEFAULT_GEAR[unit];
}
export function saveGear(unit: Unit, g: Gear) {
  try { localStorage.setItem(key(unit), JSON.stringify(g)); } catch { /* storage unavailable: this session only */ }
}
/** 82.5 -> "82.5", 80 -> "80" */
export const fmtWeight = (v: number) => String(Math.round(v * 100) / 100);
