import type { Dispatch, SetStateAction } from "react";
import { DEPTS, PILIERS, PROGS, USERS } from "../data/reference";
import { PHASES, TYPES } from "../data/templates";
import type { Initiative } from "../data/types";
import { EMPTY_INITIATIVE_FILTERS, type InitiativeFilters } from "../lib/initiativeFilters";
import FilterCombobox from "./FilterCombobox";

export default function InitiativeFilterBar({ items, filters, setFilters, flags = {} }: { items: Initiative[]; filters: InitiativeFilters; setFilters: Dispatch<SetStateAction<InitiativeFilters>>; flags?: Partial<Record<keyof InitiativeFilters, boolean>> }) {
  const enabled = (key: keyof InitiativeFilters) => flags[key] !== false;
  const update = (key: keyof InitiativeFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const porteurs = USERS.filter((u) => items.some((i) => i.porteurId === u.id));
  const responsibles = [...new Set(items.flatMap((i) => [i.metier, i.benef, i.resIT]).filter((value): value is string => Boolean(value)))].sort();
  const active = Object.values(filters).filter(Boolean).length;
  const select = (key: keyof InitiativeFilters, label: string, options: [string, string][], all = "Tous") =>
    enabled(key) && (
      <label className="fb">
        {label}
        <FilterCombobox value={filters[key]} onChange={(value) => update(key, value)} options={options} allLabel={all} />
      </label>
    );
  return <div className="fbar">
    {select("ini", "Initiative", items.map((i): [string, string] => [i.code, `${i.code} · ${i.titre}`]), "Toutes")}
    {select("type", "Type", TYPES)}
    {select("phase", "Phase", PHASES.map((p, k) => [String(k), p]), "Toutes")}
    {select("dept", "Département", DEPTS.map((d) => [d.id, d.lib]))}
    {select("porteur", "Porteur", porteurs.map((u): [string, string] => [u.id, `${u.nom} · ${u.dept || "Sans département"}`]))}
    {select("pil", "Pilier", PILIERS.map((p) => [p.id, `${p.code} – ${p.lib}`]))}
    {select("prog", "Programme", PROGS.map((p) => [p.id, `${p.code} – ${p.lib}`]))}
    {select("resp", "Responsable", responsibles.map((r): [string, string] => [r, r]))}
    {select("charte", "Charte", [["oui", "Charte validée"], ["non", "Charte non validée"]])}
    {enabled("from") && <label className="fb">Période du<input type="date" value={filters.from} onChange={(e) => update("from", e.target.value)} /></label>}
    {enabled("to") && <label className="fb">au<input type="date" value={filters.to} onChange={(e) => update("to", e.target.value)} /></label>}
    {active > 0 && <button type="button" className="btn-ghost sm" onClick={() => setFilters({ ...EMPTY_INITIATIVE_FILTERS })}>Effacer les filtres ({active})</button>}
  </div>;
}
