import { TEMPLATES, type TemplateKey } from "../data/templates";
import type { TemplateStep } from "../data/types";
import { addWork, d, iso, nextWork, TODAY_ISO, wdBetween } from "./dates";

export interface ScheduledStep extends TemplateStep {
  dur: number;
  start: string;
  end: string;
  tk: number;
}

export interface ExtraStep {
  t: string;
  dur: number;
  req: string;
}

export interface CreateDraft {
  type: string;
  it: boolean;
  terrain: boolean;
  skip: Set<number>;
  durs: number[];
  startDate: string;
  vfin?: string;
  extra?: ExtraStep[];
}

export const tplKey = (draft: CreateDraft): TemplateKey =>
  draft.type === "projet" && draft.it ? "projet_it" : (draft.type as TemplateKey);

export function defaultDurs(t: TemplateKey, terrain: boolean): number[] {
  return TEMPLATES[t].steps.map((s) => (s.terrain && !terrain ? s.durSans ?? s.dur : s.dur));
}

export function schedule(draft: CreateDraft): ScheduledStep[] {
  const durs = [...draft.durs];
  if (draft.type === "veille" && draft.startDate && draft.vfin && draft.vfin >= draft.startDate) {
    durs[0] = Math.max(1, wdBetween(nextWork(d(draft.startDate)), d(draft.vfin)));
  }
  const sv = draft.startDate || TODAY_ISO;
  let cur = nextWork(d(sv));
  const out: ScheduledStep[] = [];
  TEMPLATES[tplKey(draft)].steps.forEach((s, k) => {
    if (draft.skip.has(k)) return;
    const dur = Math.max(1, Math.min(250, durs[k] || 1));
    const st = cur;
    const en = addWork(st, dur);
    const nx = new Date(en);
    nx.setDate(nx.getDate() + 1);
    cur = nextWork(nx);
    out.push({ ...s, dur, start: iso(st), end: iso(en), tk: k });
  });
  (draft.extra || []).forEach((s, k) => {
    const dur = Math.max(1, Math.min(250, s.dur || 1));
    const st = cur;
    const en = addWork(st, dur);
    const nx = new Date(en);
    nx.setDate(nx.getDate() + 1);
    cur = nextWork(nx);
    out.push({ t: s.t, req: s.req, dur, start: iso(st), end: iso(en), tk: EXTRA_TK_BASE + k });
  });
  return out;
}

/** Au-delà de cet index, une étape `sch[k].tk` est une étape ajoutée par l'utilisateur (hors template). */
export const EXTRA_TK_BASE = 1000;

export function emptyDraft(): CreateDraft {
  return {
    type: "projet",
    it: false,
    terrain: true,
    skip: new Set(),
    durs: defaultDurs("projet", true),
    startDate: TODAY_ISO,
    vfin: iso(addWork(d(TODAY_ISO), 2)),
  };
}
