import type { Initiative, Jalon, PlanDraft, PlanItem } from "../data/types";
import { d, days, iso, nextWork, addWork, wdBetween, isWork } from "./dates";
import { endOf } from "./domain";

export function afterDay(s: string): Date {
  const x = d(s);
  x.setDate(x.getDate() + 1);
  return nextWork(x);
}

/** Calcule les durées et la date de démarrage manquantes, en place sur l'initiative donnée. */
export function ensureDurs(i: Initiative): void {
  i.jalons.forEach((j, k) => {
    if (j.dur != null) return;
    if (k === 0) {
      j.dur = 10;
      return;
    }
    const p = i.jalons[k - 1];
    j.dur = Math.max(1, wdBetween(afterDay(p.fin || p.due), d(j.due)));
  });
  if (!i.start) {
    const f = i.jalons[0];
    const x = d(f.due);
    let c = 1;
    while (c < (f.dur || 1)) {
      x.setDate(x.getDate() - 1);
      if (isWork(x)) c++;
    }
    i.start = iso(nextWork(x));
  }
}

export function planOf(i: Initiative): PlanDraft {
  ensureDurs(i);
  if (!i.plan) {
    i.plan = {
      items: i.jalons.map((j) => ({ id: j.id, t: j.t, dur: j.dur!, due: j.due, req: j.req })),
      changes: [],
      endBefore: endOf(i),
    };
  }
  return i.plan;
}

export interface ViewRow {
  id: string;
  t: string;
  due: string;
  req: string;
  dur: number;
  st: Jalon["st"];
  f: Jalon["f"];
  coms: Jalon["coms"];
  difs: Jalon["difs"];
  charte?: boolean;
  fin?: string;
  proposed?: boolean;
  _old?: string;
}

/** Vue des jalons telle qu'affichée : réels si aucun brouillon, sinon ordre/dates du brouillon. */
export function viewList(i: Initiative): ViewRow[] {
  if (!i.plan) return i.jalons.map((j) => ({ ...j, dur: j.dur ?? 0 }));
  return i.plan.items.map((p) => {
    if (p.isNew) {
      return { id: p.id, t: p.t, due: p.due, req: p.req, dur: p.dur, st: "a_venir", f: [], coms: [], difs: [], proposed: true };
    }
    const o = i.jalons.find((x) => x.id === p.id)!;
    return { ...o, due: p.due, dur: p.dur, _old: o.due !== p.due ? o.due : undefined };
  });
}

export function lastClosedIdx(i: Initiative, exclude?: string): number {
  let n = -1;
  viewList(i)
    .filter((x) => x.id !== exclude)
    .forEach((x, k) => {
      if (x.st === "valide") n = k;
    });
  return n;
}

/** Recalcule en cascade les dates du brouillon à partir de l'index déplacé. */
export function rechainPlan(i: Initiative, from: number): void {
  const plan = i.plan!;
  let prev: string | null = null;
  plan.items.forEach((p, k) => {
    const o = p.isNew ? null : i.jalons.find((x) => x.id === p.id);
    if (o && o.st === "valide") {
      prev = o.fin || o.due;
      return;
    }
    if (k < from) {
      prev = p.due;
      return;
    }
    const st = prev ? afterDay(prev) : nextWork(d(i.start!));
    p.due = iso(addWork(st, p.dur));
    prev = p.due;
  });
}

export function planEnd(i: Initiative): string {
  return i.plan!.items.reduce((m, p) => {
    const o = p.isNew ? null : i.jalons.find((x) => x.id === p.id);
    const e = o && o.st === "valide" ? o.fin || o.due : p.due;
    return e > m ? e : m;
  }, "");
}

export const planShiftDays = (i: Initiative): number => days(d(i.plan!.endBefore), d(planEnd(i)));
export const planRole = (i: Initiative): "chef" | "dir" => (planShiftDays(i) > 30 ? "dir" : "chef");

/** Déplace un jalon à la position `to` dans le brouillon (initialise le brouillon si besoin). */
export function moveJalonInPlan(i: Initiative, jalonId: string, to: number): string | null {
  if (i.plan?.reqId) return null;
  const L = viewList(i);
  const from = L.findIndex((x) => x.id === jalonId);
  if (from < 0 || to === from || to < 0 || to >= L.length || to <= lastClosedIdx(i, jalonId)) return null;
  const plan = planOf(i);
  const [it] = plan.items.splice(from, 1);
  plan.items.splice(to, 0, it);
  rechainPlan(i, Math.min(from, to));
  const label = `« ${it.t} » déplacé en position ${to + 1}`;
  plan.changes.push(label);
  return label;
}

/** Retire un jalon du brouillon (impossible de vider le plan entièrement, ni de retirer une étape déjà clôturée). */
export function removeJalonFromPlan(i: Initiative, jalonId: string): string | null {
  if (i.plan?.reqId) return null;
  const plan = planOf(i);
  if (plan.items.length <= 1) return null;
  const idx = plan.items.findIndex((x) => x.id === jalonId);
  if (idx < 0) return null;
  const it = plan.items[idx];
  const o = it.isNew ? null : i.jalons.find((x) => x.id === it.id);
  if (o?.st === "valide") return null;
  plan.items.splice(idx, 1);
  rechainPlan(i, idx);
  const label = `« ${it.t} » retiré du planning`;
  plan.changes.push(label);
  return label;
}

export function addDraftJalon(i: Initiative, t: string, dur: number, req: string): PlanItem {
  const plan = planOf(i);
  const existingNums = [...i.jalons, ...plan.items]
    .map((x) => parseInt(String(x.id).split("-J").pop() || "0", 10))
    .filter((n) => !isNaN(n));
  const n = Math.max(0, ...existingNums) + 1;
  const item: PlanItem = { id: `${i.code}-J${n}`, t, dur, due: "", req: req || "Justificatif du jalon", isNew: true };
  plan.items.push(item);
  rechainPlan(i, plan.items.length - 1);
  plan.changes.push(`Ajout du jalon « ${t} » (${dur} j. ouvrés)`);
  return item;
}
