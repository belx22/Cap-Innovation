import { HOLIDAYS } from "../data/holidays";

export const TODAY = new Date();
export const TODAY_ISO = [TODAY.getFullYear(), String(TODAY.getMonth() + 1).padStart(2, "0"), String(TODAY.getDate()).padStart(2, "0")].join("-");
export const TODAY_LABEL = TODAY.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const TODAY_SHORT_LABEL = TODAY.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export const d = (s: string): Date => new Date(s + "T12:00:00");

export const iso = (x: Date): string =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

export const days = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / 86400000);

export const fmt = (s: string): string =>
  d(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

export const fmtY = (s: string): string =>
  d(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export const isWork = (x: Date): boolean =>
  x.getDay() !== 0 && x.getDay() !== 6 && !HOLIDAYS.includes(iso(x));

export function nextWork(x: Date): Date {
  const y = new Date(x);
  while (!isWork(y)) y.setDate(y.getDate() + 1);
  return y;
}

export function addWork(x: Date, n: number): Date {
  const y = new Date(x);
  let c = 1;
  while (c < n) {
    y.setDate(y.getDate() + 1);
    if (isWork(y)) c++;
  }
  return y;
}

export function wdBetween(a: Date, b: Date): number {
  let n = 0;
  const x = new Date(a);
  while (x <= b) {
    if (isWork(x)) n++;
    x.setDate(x.getDate() + 1);
  }
  return n;
}

export function addMonths(s: string, n: number): string {
  const x = d(s);
  x.setMonth(x.getMonth() + n);
  return iso(x);
}

export function stamp(): string {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")} ${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
