import { endOf, currentPhase, typeKey } from "./domain";
import type { Initiative } from "../data/types";

export interface InitiativeFilters {
  ini: string;
  type: string;
  phase: string;
  dept: string;
  porteur: string;
  pil: string;
  prog: string;
  resp: string;
  charte: string;
  from: string;
  to: string;
}

export const EMPTY_INITIATIVE_FILTERS: InitiativeFilters = {
  ini: "", type: "", phase: "", dept: "", porteur: "", pil: "", prog: "", resp: "", charte: "", from: "", to: "",
};

export function matchesInitiative(i: Initiative, f: InitiativeFilters): boolean {
  const start = i.deb || i.start || i.jalons[0]?.due || "";
  return (!f.ini || i.code === f.ini) && (!f.type || typeKey(i) === f.type) && (!f.phase || String(currentPhase(i)) === f.phase) &&
    (!f.dept || i.dept === f.dept) && (!f.porteur || i.porteurId === f.porteur) && (!f.pil || i.pil === f.pil) &&
    (!f.prog || i.prog === f.prog) && (!f.resp || [i.metier, i.benef, i.resIT].includes(f.resp)) &&
    (!f.charte || (f.charte === "oui") === !!i.charteAt) && (!f.from || endOf(i) >= f.from) && (!f.to || start <= f.to);
}

export const filterInitiatives = (items: Initiative[], f: InitiativeFilters): Initiative[] => items.filter((i) => matchesInitiative(i, f));
