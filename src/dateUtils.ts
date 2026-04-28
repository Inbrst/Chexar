const dayMs = 24 * 60 * 60 * 1000;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year, month - 1, day);
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);

  return toDateKey(date);
}

export function daysInclusive(fromDateKey: string, toDateKeyValue: string): number {
  const start = parseDateKey(fromDateKey).getTime();
  const end = parseDateKey(toDateKeyValue).getTime();
  const diff = Math.floor((end - start) / dayMs) + 1;

  return Math.max(diff, 1);
}
