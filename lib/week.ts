export type WeekStart = 0 | 1 | 6; // first day of the week: 0 = Sunday, 1 = Monday, 6 = Saturday

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Local midnight of the first day of the week containing `d`. */
export function weekStartOf(d: Date, ws: WeekStart = 1): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() - ws + 7) % 7));
  return x;
}

/** e.g. "Monday to Sunday" */
export const weekRangeLong = (ws: WeekStart) => `${DAY_NAMES[ws]} to ${DAY_NAMES[(ws + 6) % 7]}`;
