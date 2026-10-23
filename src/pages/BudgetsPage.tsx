import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import {
  avgTaux,
  benItems,
  budAlert,
  budPct,
  fmtM,
  numv,
  phaseLbl,
  prog,
  tCls,
  valeurProduite,
} from "../lib/domain";
import BudgetValideEditor from "../components/BudgetValideEditor";
import InitiativeFilterBar from "../components/InitiativeFilterBar";
import type { Initiative } from "../data/types";
import { EMPTY_INITIATIVE_FILTERS, filterInitiatives, type InitiativeFilters } from "../lib/initiativeFilters";

export default function BudgetsPage({ onOpenInitiative }: { onOpenInitiative: (code: string) => void }) {
  const { scopedInnos: innos } = useStore();
  const [filters, setFilters] = useState<InitiativeFilters>({ ...EMPTY_INITIATIVE_FILTERS });
  const [alerte, setAlerte] = useState("");

  const L = useMemo(
    () =>
      innos.filter(
        (i) =>
          filterInitiatives([i], filters).length > 0 &&
          (!alerte || (budAlert(i) || [""])[0] === alerte)
      ),
    [innos, filters, alerte]
  );

  const { tv, tc, val, hasVal } = useMemo(() => {
    let tv = 0,
      tc = 0,
      val = 0,
      hasVal = false;
    L.forEach((i) => {
      tv += numv(i.bv) || 0;
      tc += numv(i.bc) || 0;
      const v = valeurProduite(i);
      if (v != null) {
        val += v;
        hasVal = true;
      }
    });
    return { tv, tc, val, hasVal };
  }, [L]);

  const rows = useMemo(
    () => L.filter((i) => numv(i.bv)).sort((a, b) => (budPct(b) || 0) - (budPct(a) || 0)),
    [L]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Dépenses et valeur produite</span>
          <h1>Budgets et valeur</h1>
          <p className="lead">
            Deux montants par initiative, budget validé et budget consommé, rapportés à l'avancement et à la valeur
            produite. Les dépassements et les consommations en avance sur l'avancement sont signalés automatiquement.
          </p>
        </div>
      </div>

      <InitiativeFilterBar items={innos} filters={filters} setFilters={setFilters} />
      <div className="fbar">
        <label className="fb">
          Alerte
          <select value={alerte} onChange={(e) => setAlerte(e.target.value)}>
            <option value="">Toutes</option>
            <option value="Dépassement">Dépassement</option>
            <option value="90 % atteints">90 % atteints</option>
            <option value="Consommation en avance">Consommation en avance</option>
          </select>
        </label>
      </div>

      <div className="summary s6">
        <div className="sum">
          <span className="v">{fmtM(tv)}</span>
          <span className="k">Budget validé (XAF)</span>
        </div>
        <div className="sum">
          <span className="v">{fmtM(tc)}</span>
          <span className="k">Budget consommé</span>
        </div>
        <div className="sum">
          <span className="v">{fmtM(Math.max(0, tv - tc))}</span>
          <span className="k">Reste à consommer</span>
        </div>
        <div className="sum">
          <span className="v">{tv ? Math.round((100 * tc) / tv) + " %" : "—"}</span>
          <span className="k">Taux de consommation</span>
        </div>
        <div className="sum ok">
          <span className="v">{hasVal ? fmtM(val) : "—"}</span>
          <span className="k">Valeur produite</span>
        </div>
        <div className="sum">
          <span className="v">{hasVal && tc ? "× " + (val / tc).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—"}</span>
          <span className="k">Ratio valeur / dépense</span>
        </div>
      </div>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Consommation et avancement</h2>
          <p className="sub">Pour chaque initiative, la part du budget consommée (barre colorée) face à l'avancement des étapes (barre bleue)</p>
        </div>
        <div className="cmp">
          {rows.length === 0 && <div className="empty">Aucune initiative ne correspond aux filtres.</div>}
          {rows.map((i) => {
            const pc = budPct(i) || 0;
            const pr = prog(i);
            return (
              <div className="cmp-r" key={i.code}>
                <span className="nm" title={i.titre}>
                  <b>{i.code}</b> {i.titre}
                </span>
                <span className="cmp-b">
                  <span className={`c${pc > 100 ? " over" : pc >= 80 ? " mid" : ""}`}>
                    <i style={{ width: `${Math.min(100, pc)}%` }}></i>
                  </span>
                  <span className="a">
                    <i style={{ width: `${pr}%` }}></i>
                  </span>
                </span>
                <span className="v">
                  {pc} % · {pr} %
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Détail par initiative</h2>
          <p className="sub">Trié par dépassement. Le ratio valeur / dépense rapporte la valeur financière mesurée au budget consommé.</p>
        </div>
        <div className="tbl-wrap">
          <table className="vt">
            <thead>
              <tr>
                <th>Initiative</th>
                <th>Phase</th>
                <th>Validé</th>
                <th>Consommé</th>
                <th>Avancement</th>
                <th>Atteinte</th>
                <th>Valeur produite</th>
                <th>Ratio</th>
                <th>Alerte</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ color: "var(--muted)" }}>
                    Aucune initiative ne correspond aux filtres.
                  </td>
                </tr>
              )}
              {rows.map((i) => (
                <BudgetRow key={i.code} i={i} onOpenInitiative={onOpenInitiative} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BudgetRow({ i, onOpenInitiative }: { i: Initiative; onOpenInitiative: (code: string) => void }) {
  const pc = budPct(i);
  const a = avgTaux(benItems(i).filter((x) => x.st === "atteint" || x.st === "partiel").map((x) => x.obj));
  const v = valeurProduite(i);
  const al = budAlert(i);
  return (
    <tr>
      <td>
        <button type="button" className="linkish" onClick={() => onOpenInitiative(i.code)}>
          <b>{i.code}</b> {i.titre}
        </button>
      </td>
      <td>{phaseLbl(i)}</td>
      <td className="mono">
        <BudgetValideEditor i={i} />
      </td>
      <td className="mono">
        <span className={`minibar${(pc || 0) > 100 ? " over" : ""}`}>
          <i style={{ width: `${Math.min(100, pc || 0)}%` }}></i>
        </span>
        {fmtM(i.bc)} · {pc} %
      </td>
      <td className="mono">{prog(i)} %</td>
      <td>{a == null ? "—" : <span className={`chip ${tCls(a)}`}>{a} %</span>}</td>
      <td className="mono">{v == null ? "—" : fmtM(v)}</td>
      <td className="mono">{v != null && numv(i.bc) ? "× " + (v / (numv(i.bc) || 1)).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "Non calculé"}</td>
      <td>{al && <span className={`chip ${al[1]}`}>{al[0]}</span>}</td>
    </tr>
  );
}
