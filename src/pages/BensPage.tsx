import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import InitiativeFilterBar from "../components/InitiativeFilterBar";
import {
  avgTaux,
  benItems,
  benState,
  fmtM,
  fmtN,
  isClosedInno,
  isReco,
  normBens,
  numv,
  suivi,
  tCls,
  tauxOf,
  typeLbl,
  valeurProduite,
} from "../lib/domain";
import { fmt, fmtY } from "../lib/dates";
import Meter from "../components/Meter";
import { RecoItem } from "./RecosPage";
import type { Benefice, Initiative } from "../data/types";
import { EMPTY_INITIATIVE_FILTERS, filterInitiatives, type InitiativeFilters } from "../lib/initiativeFilters";

const BST: Record<string, [string, string]> = {
  attente: ["Mesure à la clôture", "c-a_venir"],
  amesurer: ["À mesurer", "c-en_retard"],
  atteint: ["Atteint", "c-valide"],
  partiel: ["Partiellement atteint", "c-complement"],
};

type Filter = "tous" | "amesurer" | "partiel" | "atteint" | "attente";

export function BenItem({ i, b }: { i: Initiative; b: Benefice }) {
  const { updateBenefit, requestBenefitWithdrawal } = useStore();
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const st = benState(i, b);
  const t = tauxOf(b);
  const closed = isClosedInno(i);

  return (
    <div className={`rec${open ? " open" : ""}`}>
      <button type="button" className="rec-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="k">•</span>
        <span>
          <span className="rec-t">{b.lib}</span>
          <span className="sub">
            {numv(b.dep) != null ? `départ ${fmtN(b.dep)} → ` : ""}cible {numv(b.cib) != null ? `${fmtN(b.cib)} ${b.unit}` : "à préciser"}
            {numv(b.val) != null ? ` · mesuré ${fmtN(b.val)} ${b.unit}` : ""} · mesure {closed ? "prévue le" : "à partir de la clôture, prévue le"} {fmt(b.dmes)}
          </span>
        </span>
        <span className="chips">
          <span className={`chip ${BST[st][1]}`}>{BST[st][0]}</span>
          {t != null && <span className={`chip ${tCls(t)}`}>Atteint à {t} %</span>}
        </span>
        <span className="chev" aria-hidden="true">
          ›
        </span>
      </button>
      {open && (
        <div className="rec-body">
          <label className="field" htmlFor={`${b.id}-lib`}>
            Bénéfice attendu
            <textarea id={`${b.id}-lib`} className="obj-t" defaultValue={b.lib} maxLength={160} rows={2} onBlur={(e) => e.target.value.trim() && updateBenefit(i.code, b.id, { lib: e.target.value.trim() })} />
          </label>
          <div className="obj-grid">
            <label className="field" htmlFor={`${b.id}-dep`}>
              Valeur de départ
              <input id={`${b.id}-dep`} inputMode="decimal" defaultValue={b.dep} placeholder="Facultatif" onBlur={(e) => updateBenefit(i.code, b.id, { dep: e.target.value })} />
            </label>
            <label className="field" htmlFor={`${b.id}-cib`}>
              Valeur cible
              <input id={`${b.id}-cib`} inputMode="decimal" defaultValue={b.cib} onBlur={(e) => updateBenefit(i.code, b.id, { cib: e.target.value })} />
            </label>
            <label className="field" htmlFor={`${b.id}-unit`}>
              Unité
              <input id={`${b.id}-unit`} defaultValue={b.unit} maxLength={30} onBlur={(e) => updateBenefit(i.code, b.id, { unit: e.target.value })} />
            </label>
          </div>
          <label className="field" htmlFor={`${b.id}-dmes`} style={{ maxWidth: 220 }}>
            Date de mesure prévue
            <input id={`${b.id}-dmes`} type="date" defaultValue={b.dmes} onChange={(e) => updateBenefit(i.code, b.id, { dmes: e.target.value })} />
          </label>
          <div className="mes">
            <div className="mes-h">
              <b>Mesure de l'atteinte</b>
              {b.mesAt && <span className="sub">Mesuré le {fmtY(b.mesAt)}</span>}
            </div>
            {closed ? (
              <>
                <div className="obj-grid2">
                  <label className="field" htmlFor={`${b.id}-val`}>
                    Valeur mesurée
                    <input id={`${b.id}-val`} inputMode="decimal" defaultValue={b.val} placeholder="Ex. 64" onBlur={(e) => updateBenefit(i.code, b.id, { val: e.target.value })} />
                  </label>
                  <div className="taux">
                    <span className="lbl">Taux d'atteinte du bénéfice</span>
                    {t == null ? <span className="hint">Renseignez la cible et la valeur mesurée.</span> : <Meter value={t} />}
                  </div>
                </div>
                <label className="field" htmlFor={`${b.id}-res`}>
                  Constat
                  <textarea id={`${b.id}-res`} defaultValue={b.res} maxLength={255} placeholder="Ce qui explique le résultat, écarts constatés" onBlur={(e) => updateBenefit(i.code, b.id, { res: e.target.value })} />
                </label>
              </>
            ) : (
              <p className="lock">La mesure s'ouvrira à la clôture de la dernière étape. L'application la demandera alors à {suivi(i)}.</p>
            )}
          </div>
          <div className="clo-act">
            {b.pendDel ? (
              <span className="chip c-a_venir">Retrait en attente de validation</span>
            ) : (
              <button
                type="button"
                className={`btn-ghost sm danger${armed ? " armed" : ""}`}
                onClick={() => {
                  if (!armed) {
                    setArmed(true);
                    setTimeout(() => setArmed(false), 4000);
                    return;
                  }
                  requestBenefitWithdrawal(i, b);
                  setArmed(false);
                }}
              >
                {armed ? "Confirmer la demande de retrait" : "Retirer ce bénéfice (soumis à validation)"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AddBenForm({ i }: { i: Initiative }) {
  const { addBenefit } = useStore();
  const [openForm, setOpenForm] = useState(false);
  const [lib, setLib] = useState("");
  const [dep, setDep] = useState("");
  const [cib, setCib] = useState("");
  const [unit, setUnit] = useState("");

  if (!openForm)
    return (
      <div className="note-btns">
        <button type="button" className="btn-ghost sm" onClick={() => setOpenForm(true)}>
          + Bénéfice attendu
        </button>
      </div>
    );

  return (
    <div className="recos-add">
      <label className="field">
        Bénéfice attendu
        <input value={lib} onChange={(e) => setLib(e.target.value)} maxLength={160} placeholder="Ex. Réduction du temps d'attente en agence" />
      </label>
      <div className="obj-grid">
        <label className="field">
          Valeur de départ
          <input value={dep} onChange={(e) => setDep(e.target.value)} inputMode="decimal" placeholder="Facultatif" />
        </label>
        <label className="field">
          Valeur cible
          <input value={cib} onChange={(e) => setCib(e.target.value)} inputMode="decimal" />
        </label>
        <label className="field">
          Unité
          <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} />
        </label>
      </div>
      <div className="clo-act">
        <button type="button" className="btn-ghost" onClick={() => setOpenForm(false)}>
          Annuler
        </button>
        <button
          type="button"
          className="btn"
          disabled={!lib.trim()}
          onClick={() => {
            addBenefit(i.code, { lib: lib.trim(), dep: dep.trim(), cib: cib.trim(), unit: unit.trim() });
            setLib("");
            setDep("");
            setCib("");
            setUnit("");
            setOpenForm(false);
          }}
        >
          Enregistrer le bénéfice
        </button>
      </div>
    </div>
  );
}

export default function BensPage({ onOpenInitiative }: { onOpenInitiative: (code: string) => void }) {
  const { scopedInnos: innos } = useStore();
  const [filters, setFilters] = useState<InitiativeFilters>({ ...EMPTY_INITIATIVE_FILTERS });
  const [filter, setFilter] = useState<Filter>("tous");

  const scoped = useMemo(() => filterInitiatives(innos, filters), [innos, filters]);

  const all = useMemo(() => {
    const out: { i: Initiative; st: string; obj: { cib?: string; val?: string; unit?: string } }[] = [];
    scoped.forEach((i) => benItems(i).forEach((x) => out.push({ i, st: x.st, obj: x.obj })));
    return out;
  }, [scoped]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { tous: all.length, amesurer: 0, partiel: 0, atteint: 0, attente: 0 };
    all.forEach((x) => {
      if (x.st in c) c[x.st as Filter]++;
    });
    return c;
  }, [all]);

  const taux = avgTaux(all.filter((x) => x.st === "atteint" || x.st === "partiel").map((x) => x.obj));
  const valTotal = useMemo(() => scoped.reduce((a, i) => a + (valeurProduite(i) || 0), 0), [scoped]);
  const hasVal = useMemo(() => scoped.some((i) => valeurProduite(i) != null), [scoped]);

  const nodef = useMemo(() => scoped.filter((i) => !isReco(i) && !normBens(i).length), [scoped]);

  const groups = useMemo(() => {
    const keep = (st: string) => filter === "tous" || st === filter;
    return scoped
      .map((i) => ({
        i,
        recoItems: isReco(i) ? benItems(i).filter((x) => keep(x.st)) : [],
        benItemsList: !isReco(i) ? normBens(i).filter((b) => keep(benState(i, b))) : [],
      }))
      .filter((g) => g.recoItems.length || g.benItemsList.length);
  }, [scoped, filter]);

  const FLIST: [Filter, string][] = [
    ["tous", "Tous"],
    ["amesurer", "À mesurer"],
    ["partiel", "Partiellement atteints"],
    ["atteint", "Atteints"],
    ["attente", "En attente"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Toutes les initiatives</span>
          <h1>Bénéfices et valeur produite</h1>
          <p className="lead">
            Tous les bénéfices suivis au même endroit : ceux des projets et produits, et ceux des recommandations
            issues des études et des veilles.
          </p>
        </div>
      </div>

      <InitiativeFilterBar items={innos} filters={filters} setFilters={setFilters} flags={{ phase: false }} />

      <div className="summary s6">
        <div className="sum">
          <span className="v">{all.length}</span>
          <span className="k">Bénéfices suivis</span>
        </div>
        <div className="sum">
          <span className="v">{counts.attente}</span>
          <span className="k">En attente</span>
        </div>
        <div className="sum late">
          <span className="v">{counts.amesurer}</span>
          <span className="k">À mesurer</span>
        </div>
        <div className="sum ok">
          <span className="v">{counts.atteint}</span>
          <span className="k">Atteints</span>
        </div>
        <div className="sum">
          <span className="v">{taux == null ? "—" : taux + " %"}</span>
          <span className="k">Taux moyen d'atteinte</span>
        </div>
        <div className="sum">
          <span className="v">{hasVal ? fmtM(valTotal) : "—"}</span>
          <span className="k">Valeur financière produite</span>
        </div>
      </div>

      <div className="rfilters" role="group" aria-label="Filtrer les bénéfices">
        {FLIST.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l}
            <span className="n">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {groups.length === 0 && (
          <div className="panel">
            <div className="empty">
              <b>Aucun bénéfice</b>
              Aucun bénéfice ne correspond à ces filtres.
            </div>
          </div>
        )}
        {groups.map(({ i, recoItems, benItemsList }) => (
          <div className="rgroup" key={i.code}>
            <div className="rgroup-h">
              <h2>
                <button type="button" className="linkish" style={{ fontSize: 15, fontWeight: 700 }} onClick={() => onOpenInitiative(i.code)}>
                  {i.code} · {i.titre}
                </button>
              </h2>
              <span className="sub">
                {isReco(i) ? "Recommandations" : "Bénéfices attendus"} · responsable métier : {suivi(i)}
                {numv(i.bv) ? ` · budget ${fmtM(i.bc)} / ${fmtM(i.bv)} XAF consommé` : ""}
                {valeurProduite(i) != null ? ` · valeur produite ${fmtM(valeurProduite(i))} XAF` : ""} ·{" "}
                {isClosedInno(i) ? "clôturé" : "en cours"} · {typeLbl(i)}
              </span>
            </div>
            <div className="recs">
              {isReco(i)
                ? normRecosFiltered(i, recoItems.map((x) => x.key)).map((r) => <RecoItem key={r.id} i={i} r={r} />)
                : benItemsList.map((b, k) => <BenItem key={b.id || k} i={i} b={b} />)}
            </div>
            {!isReco(i) && <AddBenForm i={i} />}
          </div>
        ))}
        {filter === "tous" && nodef.length > 0 && (
          <div className="panel pad">
            <h2 style={{ fontSize: 15 }}>Projets et produits sans bénéfice défini</h2>
            <div className="missing">
              {nodef.map((i) => (
                <div className="miss" key={i.code}>
                  <div>
                    <b>
                      {i.code} · {i.titre}
                    </b>
                    <div className="sub">
                      {typeLbl(i)} · responsable métier {suivi(i)}
                    </div>
                  </div>
                  <button className="btn-ghost" onClick={() => onOpenInitiative(i.code)}>
                    Définir les bénéfices
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function normRecosFiltered(i: Initiative, keys: string[]) {
  return (i.recos || []).filter((r) => keys.includes(r.id));
}
