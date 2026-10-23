import type { Benefice, Initiative, Jalon, Recommandation } from "../data/types";
import { PHASES, TEMPLATES } from "../data/templates";
import { deptName } from "../data/reference";
import { TODAY, addMonths, d, days, iso } from "./dates";

export const numv = (v: unknown): number | null => {
  if (v == null || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isFinite(n) ? n : null;
};

export const fmtN = (v: unknown): string => {
  const n = numv(v);
  return n == null ? "" : n.toLocaleString("fr-FR");
};

export const fmtXAF = (v: unknown): string => {
  const n = numv(v);
  return n == null ? "—" : Math.round(n).toLocaleString("fr-FR") + " XAF";
};

export const fmtM = (v: unknown): string => {
  const n = numv(v);
  if (n == null) return "—";
  const m = n / 1e6;
  return (m >= 10 ? Math.round(m) : Math.round(m * 10) / 10).toLocaleString("fr-FR") + " M";
};

export const budPct = (i: Initiative): number | null => {
  const a = numv(i.bv);
  const c = numv(i.bc);
  return a && c != null ? Math.round((100 * c) / a) : null;
};

export const isReco = (i: Initiative): boolean =>
  i.type === "etude" || i.type === "veille" || !!TEMPLATES[i.type]?.reco;
export const artOf = (i: Initiative): string =>
  i.type === "veille" ? "la veille" : i.type === "etude" ? "l'étude" : "l'initiative";
export const benT = (t: Initiative["type"]): boolean =>
  t === "projet" ||
  t === "produit" ||
  t === "maintenance" ||
  t === "gouvernance" ||
  !!(TEMPLATES[t]?.custom && !TEMPLATES[t]?.reco);
export const isProj = (i: Initiative): boolean => i.type === "projet";
export const charteOK = (i: Initiative): boolean => isProj(i) && !!i.charteAt;
export const suivi = (i: Initiative): string => i.metier || i.porteur || "responsable métier";

export const typeKey = (i: Initiative): string => (i.type === "projet" && i.it ? "projet_it" : i.type);
export const typeLbl = (i: Initiative): string =>
  i.type === "projet" && i.it ? "Projet IT" : TEMPLATES[i.type].label;
export const tchipShort = (i: Initiative): string => TEMPLATES[i.type]?.short || typeLbl(i);

export const needsDecision = (j: Jalon): boolean => j.st === "a_valider" || j.st === "en_retard";

/**
 * Phase courante d'une initiative : celle du premier jalon non clôturé (règle du cahier
 * des charges), ou 4 (Généralisée) si tous les jalons sont clôturés. Les jalons sans
 * `phase` renseignée (données historiques) retombent sur le champ `i.phase` statique.
 */
export const currentPhase = (i: Initiative): number => {
  if (i.jalons.every((x) => x.st === "valide")) return 4;
  const next = i.jalons.find((x) => x.st !== "valide");
  return next?.phase ?? i.phase ?? 0;
};

export const phaseLbl = (i: Initiative): string => {
  if (isReco(i)) return i.jalons.every((x) => x.st === "valide") ? "Clôturée" : "En cours";
  return PHASES[currentPhase(i)];
};

export const prog = (i: Initiative): number =>
  Math.round((100 * i.jalons.filter((j) => j.st === "valide").length) / i.jalons.length);

export type HealthState = [string, string];
export const health = (i: Initiative): HealthState => {
  if (i.abandoned) return ["h-abandon", "Abandonnée"];
  if (i.susp) return ["h-susp", "Suspendue"];
  if (i.jalons.some((j) => j.st === "en_retard")) return ["h-late", "En retard"];
  if (i.jalons.some((j) => needsDecision(j) && d(j.due) < TODAY)) return ["h-risk", "À surveiller"];
  return ["h-ok", "Dans les temps"];
};

export const isClosedInno = (i: Initiative): boolean => i.jalons.every((x) => x.st === "valide");

export function normBens(i: Initiative): Benefice[] {
  if (!i.bens) i.bens = [];
  i.bens.forEach((b, k) => {
    b.id = b.id || `${i.code}-B${k + 1}`;
    b.dep = b.dep || "";
    b.cib = b.cib || "";
    b.unit = b.unit || "";
    b.val = b.val || "";
    b.res = b.res || "";
    b.dmes = b.dmes || addMonths(endOf(i), 3);
  });
  return i.bens;
}

export function normRecos(i: Initiative): Recommandation[] {
  if (!i.recos) i.recos = [];
  i.recos.forEach((r, k) => {
    r.id = r.id || `${i.code}-R${k + 1}`;
    r.st = r.st || "a_lancer";
    r.suivi = r.suivi || [];
    r.f = r.f || [];
    r.resp = r.resp || "";
    r.ech = r.ech || "";
  });
  return i.recos;
}

export const endOf = (i: Initiative): string =>
  i.jalons.reduce((m, j) => {
    const e = j.fin || j.due;
    return e > m ? e : m;
  }, "");

export function tauxOf(r: { cib?: string; val?: string; dep?: string }): number | null {
  const c = numv(r.cib);
  const v = numv(r.val);
  const dp = numv(r.dep);
  if (c == null || v == null) return null;
  if (dp != null && dp !== c) return Math.round((100 * (v - dp)) / (c - dp));
  if (c === 0) return null;
  return Math.round((100 * v) / c);
}

export const tCls = (t: number): string => (t >= 100 ? "t-ok" : t >= 50 ? "t-mid" : "t-low");

export function avgTaux(list: { cib?: string; val?: string; dep?: string }[]): number | null {
  const ts = list.map(tauxOf).filter((t): t is number => t != null);
  return ts.length ? Math.round(ts.reduce((a, b) => a + Math.max(0, Math.min(100, b)), 0) / ts.length) : null;
}

export const recoLate = (r: Recommandation): boolean =>
  !!r.ech && r.ech < iso(TODAY) && (r.st === "a_lancer" || r.st === "en_cours");

export const benState = (i: Initiative, b: Benefice): "attente" | "amesurer" | "atteint" | "partiel" => {
  if (!isClosedInno(i)) return "attente";
  if (numv(b.val) == null) return "amesurer";
  const t = tauxOf(b);
  return t != null && t >= 100 ? "atteint" : "partiel";
};

const isFinUnit = (unit?: string): boolean => /^\s*(xaf|fcfa)\s*$/i.test(unit || "");

export function valeurProduite(i: Initiative): number | null {
  let v = 0,
    n = 0;
  normBens(i).forEach((b) => {
    if (isFinUnit(b.unit) && numv(b.val) != null && isClosedInno(i)) {
      v += numv(b.val) || 0;
      n++;
    }
  });
  normRecos(i).forEach((r) => {
    if (isFinUnit(r.unit) && numv(r.val) != null) {
      v += numv(r.val) || 0;
      n++;
    }
  });
  return n ? v : null;
}

export function finTarget(i: Initiative): number {
  let total = 0;
  normBens(i).forEach((b) => {
    if (isFinUnit(b.unit) && numv(b.cib) != null) total += numv(b.cib) || 0;
  });
  normRecos(i).forEach((r) => {
    if (isFinUnit(r.unit) && numv(r.cib) != null) total += numv(r.cib) || 0;
  });
  return total;
}

export interface ActionItem {
  i: Initiative;
  j: Jalon;
  kind: "val" | "just";
}

export function actions(innos: Initiative[]): ActionItem[] {
  const out: ActionItem[] = [];
  innos
    .filter((i) => !i.susp)
    .forEach((i) =>
      i.jalons.forEach((j) => {
        if (needsDecision(j)) out.push({ i, j, kind: j.f.length ? "val" : "just" });
      })
    );
  return out.sort(
    (a, b) =>
      (a.j.st === "en_retard" ? -1 : 0) - (b.j.st === "en_retard" ? -1 : 0) ||
      d(a.j.due).getTime() - d(b.j.due).getTime()
  );
}

export const STAT: [string, string][] = [
  ["En cours", "c-a_valider"],
  ["Non démarrée", "c-a_venir"],
  ["En retard", "c-en_retard"],
  ["Bloquée", "c-ko"],
  ["Suspendue", "h-susp"],
  ["Terminée", "c-valide"],
];

export function statusOf(i: Initiative): string {
  if (i.susp) return "Suspendue";
  if (i.jalons.every((j) => j.st === "valide")) return "Terminée";
  const T = iso(TODAY);
  const late = i.jalons.filter(
    (j) => j.st === "en_retard" || (j.st === "complement" && j.due < T) || (j.st === "a_venir" && j.due < T)
  );
  if (late.some((j) => j.difs.length || j.st === "complement")) return "Bloquée";
  if (late.length) return "En retard";
  if (!i.jalons.some((j) => j.st === "valide") && !i.jalons.some((j) => j.f.length)) return "Non démarrée";
  return "En cours";
}

export interface PerfStats {
  J: Jalon[];
  echues: Jalon[];
  closed: Jalon[];
  onTime: Jalon[];
  openLate: Jalon[];
  closedLate: Jalon[];
  exec: number | null;
  delais: number | null;
  retard: number | null;
  bv: number;
  bc: number;
  val: number;
}

export function perfOf(L: Initiative[]): PerfStats {
  const T = iso(TODAY);
  const J = L.flatMap((i) => i.jalons);
  const echues = J.filter((j) => j.due <= T);
  const closed = J.filter((j) => j.st === "valide");
  const onTime = closed.filter((j) => (j.fin || j.due) <= j.due);
  const openLate = J.filter((j) => j.st !== "valide" && j.due < T);
  const closedLate = closed.filter((j) => (j.fin || j.due) > j.due);
  const lateDays = openLate.map((j) => days(d(j.due), TODAY));
  const exec = echues.length ? Math.round((100 * echues.filter((j) => j.st === "valide").length) / echues.length) : null;
  return {
    J,
    echues,
    closed,
    onTime,
    openLate,
    closedLate,
    exec,
    delais: closed.length ? Math.round((100 * onTime.length) / closed.length) : null,
    retard: lateDays.length ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : null,
    bv: L.reduce((a, i) => a + (numv(i.bv) || 0), 0),
    bc: L.reduce((a, i) => a + (numv(i.bc) || 0), 0),
    val: L.reduce((a, i) => a + (valeurProduite(i) || 0), 0),
  };
}

export type BenItemState = "attente" | "amesurer" | "atteint" | "partiel";

export interface BenItem {
  key: string;
  lib: string;
  st: BenItemState;
  obj: { cib?: string; val?: string; unit?: string };
  isReco: boolean;
}

export const recoBenState = (r: Recommandation): BenItemState => {
  if (numv(r.val) != null) {
    const t = tauxOf(r);
    return t != null && t >= 100 ? "atteint" : "partiel";
  }
  return r.st === "realisee" ? "amesurer" : "attente";
};

export function benItems(i: Initiative): BenItem[] {
  if (isReco(i)) {
    return normRecos(i).map((r) => ({
      key: r.id,
      lib: r.txt,
      st: recoBenState(r),
      obj: { cib: r.cib, val: r.val, unit: r.unit },
      isReco: true,
    }));
  }
  return normBens(i).map((b) => ({
    key: b.id,
    lib: b.lib,
    st: benState(i, b),
    obj: { cib: b.cib, val: b.val, unit: b.unit },
    isReco: false,
  }));
}

export const MEPRX = /mise en production|lancement commercial|d[ée]ploiement|g[ée]n[ée]ralisation/i;

export interface InstanceItem {
  late: boolean;
  at: string;
  k: string;
  t: string;
  i: Initiative;
}

export function deptInstances(L: Initiative[]): InstanceItem[] {
  const out: InstanceItem[] = [];
  actions(L).forEach(({ i, j, kind }) =>
    out.push({
      late: j.st === "en_retard",
      at: j.due,
      k: kind === "val" ? "Étape à clôturer" : "Justificatif à déposer",
      t: `${j.t} · échéance ${j.due}`,
      i,
    })
  );
  L.filter((i) => !isReco(i)).forEach((i) =>
    normBens(i).forEach((b) => {
      if (benState(i, b) === "amesurer")
        out.push({ late: b.dmes < iso(TODAY), at: b.dmes, k: "Bénéfice à mesurer", t: b.lib, i });
    })
  );
  L.filter(isReco).forEach((i) =>
    normRecos(i)
      .filter(recoLate)
      .forEach((r) => out.push({ late: true, at: r.ech, k: "Recommandation en retard", t: `${r.txt} · échéance ${r.ech}`, i }))
  );
  L.forEach((i) =>
    i.jalons
      .filter((j) => j.st !== "valide" && j.difs.length)
      .forEach((j) => {
        const x = j.difs[j.difs.length - 1];
        out.push({ late: false, at: x.at, k: "Difficulté signalée", t: `${j.t} : ${x.txt}`, i });
      })
  );
  return out.sort((a, b) => Number(b.late) - Number(a.late) || String(a.at).localeCompare(String(b.at)));
}

export const budAlert = (i: Initiative): [string, string] | null => {
  const pc = budPct(i);
  if (pc == null) return null;
  if (pc > 100) return ["Dépassement", "c-ko"];
  if (pc >= 90) return ["90 % atteints", "c-complement"];
  if (pc - prog(i) > 20) return ["Consommation en avance", "c-complement"];
  return null;
};

export { deptName };
