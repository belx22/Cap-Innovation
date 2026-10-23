import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import InitiativeCard from "../components/InitiativeCard";
import InitiativeFilterBar from "../components/InitiativeFilterBar";
import { PHASES, TYPES } from "../data/templates";
import { DEPTS, PILIERS, deptName, pilOf, progOf } from "../data/reference";
import {
  budPct,
  charteOK,
  currentPhase,
  health,
  phaseLbl,
  prog,
  typeKey,
  typeLbl,
} from "../lib/domain";
import type { Initiative } from "../data/types";
import { EMPTY_INITIATIVE_FILTERS, filterInitiatives, type InitiativeFilters } from "../lib/initiativeFilters";

type ViewMode = "kanban" | "liste" | "cartes";
type GroupKey = "phase" | "type" | "dept" | "pil" | "sante";
type SortKey = "ech" | "code" | "prog" | "sante" | "bud" | "phase";

const HRANK: Record<string, number> = { "En retard": 0, "À surveiller": 1, Suspendue: 2, "Dans les temps": 3 };
const nextDue = (i: Initiative) => {
  const n = i.jalons.find((j) => j.st !== "valide");
  return n ? n.due : "9999";
};

export default function PortfolioPage({ onOpenInitiative, onEditInitiative }: { onOpenInitiative: (code: string) => void; onEditInitiative: (code: string) => void }) {
  const { scopedInnos: innos, profile, me } = useStore();
  const [view, setView] = useState<ViewMode>("kanban");
  const [group, setGroup] = useState<GroupKey>("phase");
  const [sortKey, setSortKey] = useState<SortKey>("ech");
  const [dir, setDir] = useState(1);
  const [filters, setFilters] = useState<InitiativeFilters>({ ...EMPTY_INITIATIVE_FILTERS });

  const filtered = useMemo(() => filterInitiatives(innos, filters), [innos, filters]);
  const canEdit = (i: Initiative) => profile === "admin" || i.porteurId === me.id;

  function sortList(L: Initiative[]): Initiative[] {
    const f: Record<SortKey, (i: Initiative) => number | string> = {
      code: (i) => i.code,
      phase: (i) => currentPhase(i),
      prog: (i) => prog(i),
      sante: (i) => HRANK[health(i)[1]] ?? 3,
      ech: nextDue,
      bud: (i) => budPct(i) ?? -1,
    };
    const sel = f[sortKey];
    return [...L].sort((a, b) => {
      const x = sel(a);
      const y = sel(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir || a.code.localeCompare(b.code);
    });
  }

  function groups(L: Initiative[]): { h: string; L: Initiative[] }[] {
    if (group === "phase") return PHASES.map((p, k) => ({ h: p, L: L.filter((i) => currentPhase(i) === k) }));
    if (group === "type") {
      const ks = [...new Set(L.map(typeKey))];
      return TYPES.filter((t) => ks.includes(t[0])).map(([k, l]) => ({ h: l, L: L.filter((i) => typeKey(i) === k) }));
    }
    if (group === "dept") {
      const withDept = DEPTS.map((x) => ({ h: x.lib, L: L.filter((i) => i.dept === x.id) }));
      const noDept = L.filter((i) => !DEPTS.some((x) => x.id === i.dept));
      return noDept.length ? [...withDept, { h: "Sans département", L: noDept }] : withDept;
    }
    if (group === "pil")
      return PILIERS.map((x) => ({ h: `${x.code} – ${x.lib}`, L: L.filter((i) => i.pil === x.id) })).filter((g) => g.L.length);
    return ["En retard", "À surveiller", "Suspendue", "Dans les temps"]
      .map((hh) => ({ h: hh, L: L.filter((i) => health(i)[1] === hh) }))
      .filter((g) => g.L.length || g.h !== "Suspendue");
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setDir(-dir);
    else {
      setSortKey(k);
      setDir(1);
    }
  }

  const G = view === "kanban" ? groups(filtered) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Consultation seule</span>
          <h1>Portefeuille des initiatives</h1>
          <p className="lead">
            Les phases, l'avancement et l'état de santé se mettent à jour à chaque validation de jalon. Aucune saisie
            n'est nécessaire ici.
          </p>
        </div>
        <span className="auto-chip">
          <i></i>Recalculé à chaque validation
        </span>
      </div>

      <InitiativeFilterBar items={innos} filters={filters} setFilters={setFilters} />
      <span className="fcount">{filtered.length} initiative{filtered.length > 1 ? "s" : ""}</span>

      <div className="vbar">
        <div className="vseg" role="group" aria-label="Affichage du portefeuille">
          {(["kanban", "liste", "cartes"] as ViewMode[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "kanban" ? "▦ Kanban" : v === "liste" ? "☰ Liste" : "▤ Cartes"}
            </button>
          ))}
        </div>
        {view === "kanban" && (
          <label className="fb">
            Colonnes par
            <select value={group} onChange={(e) => setGroup(e.target.value as GroupKey)}>
              <option value="phase">Phase</option>
              <option value="type">Type</option>
              <option value="dept">Département</option>
              <option value="pil">Pilier</option>
              <option value="sante">État de santé</option>
            </select>
          </label>
        )}
        {view !== "kanban" && (
          <label className="fb">
            Trier par
            <select value={sortKey} onChange={(e) => { setSortKey(e.target.value as SortKey); setDir(1); }}>
              <option value="ech">Prochaine échéance</option>
              <option value="code">Code</option>
              <option value="prog">Avancement</option>
              <option value="sante">État de santé</option>
              <option value="bud">Consommation budgétaire</option>
            </select>
          </label>
        )}
      </div>

      {view === "kanban" && (
        <div className="board" style={{ gridTemplateColumns: `repeat(${Math.max(1, G.length)},minmax(210px,1fr))` }}>
          {G.map((g) => (
            <div className="col" key={g.h}>
              <div className="col-h">
                <span>{g.h}</span>
                <span className="mono">{g.L.length}</span>
              </div>
              {g.L.length ? (
                sortList(g.L).map((i) => <InitiativeCard key={i.code} i={i} onOpen={onOpenInitiative} onEdit={onEditInitiative} canEdit={canEdit(i)} />)
              ) : (
                <div className="col-empty">Aucune initiative</div>
              )}
            </div>
          ))}
        </div>
      )}

      {view === "liste" && (
        <div className="panel">
          <div className="tbl-wrap">
            <table className="vt pf-t">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="th-s" onClick={() => toggleSort("code")}>
                      Initiative
                    </button>
                  </th>
                  <th>Type</th>
                  <th>
                    <button type="button" className="th-s" onClick={() => toggleSort("phase")}>
                      Phase
                    </button>
                  </th>
                  <th>
                    <button type="button" className="th-s" onClick={() => toggleSort("prog")}>
                      Avancement
                    </button>
                  </th>
                  <th>
                    <button type="button" className="th-s" onClick={() => toggleSort("sante")}>
                      Santé
                    </button>
                  </th>
                  <th>
                    <button type="button" className="th-s" onClick={() => toggleSort("ech")}>
                      Prochaine étape
                    </button>
                  </th>
                  <th>Porteur</th>
                  <th>
                    <button type="button" className="th-s" onClick={() => toggleSort("bud")}>
                      Budget
                    </button>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortList(filtered).length === 0 && (
                  <tr>
                    <td colSpan={9} className="hint">
                      Aucune initiative ne correspond aux filtres.
                    </td>
                  </tr>
                )}
                {sortList(filtered).map((i) => {
                  const h = health(i);
                  const pr = prog(i);
                  const nx = i.jalons.find((j) => j.st !== "valide");
                  const pc = budPct(i);
                  return (
                    <tr key={i.code}>
                      <td>
                        <button type="button" className="linkish" onClick={() => onOpenInitiative(i.code)}>
                          {i.code} · {i.titre}
                        </button>
                        <div className="hint" style={{ margin: "2px 0 0" }}>
                          {progOf(i.prog)?.code || ""} · {pilOf(i.pil)?.code || ""}
                          {charteOK(i) ? " · charte validée" : ""}
                        </div>
                      </td>
                      <td>{typeLbl(i)}</td>
                      <td>{phaseLbl(i)}</td>
                      <td className="mono">
                        <span className="minibar">
                          <i style={{ width: `${pr}%` }}></i>
                        </span>
                        {pr} %
                      </td>
                      <td>
                        <span className={`chip ${h[0]}`}>{h[1]}</span>
                      </td>
                      <td>
                        {nx ? (
                          <>
                            {nx.t}
                            <div className="hint" style={{ margin: "2px 0 0" }}>
                              {nx.due}
                              {nx.st === "en_retard" ? " · en retard" : ""}
                            </div>
                          </>
                        ) : (
                          "Tous les jalons validés"
                        )}
                      </td>
                      <td>
                        {i.porteur}
                        <div className="hint" style={{ margin: "2px 0 0" }}>
                          {deptName(i.dept)}
                        </div>
                      </td>
                      <td className="mono">
                        {pc == null ? (
                          "—"
                        ) : (
                          <>
                            <span className={`minibar${pc > 100 ? " over" : ""}`}>
                              <i style={{ width: `${Math.min(100, pc)}%` }}></i>
                            </span>
                            {pc} %
                          </>
                        )}
                      </td>
                      <td>
                        <div className="btns" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                          <button type="button" className="btn-ghost sm" onClick={() => onOpenInitiative(i.code)}>Planning et étapes</button>
                          {canEdit(i) && <button type="button" className="btn-ghost sm" onClick={() => onEditInitiative(i.code)}>Modifier</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "cartes" && (
        <div className="cards-grid">
          {sortList(filtered).length === 0 && <div className="empty">Aucune initiative ne correspond aux filtres.</div>}
          {sortList(filtered).map((i) => (
            <InitiativeCard key={i.code} i={i} onOpen={onOpenInitiative} onEdit={onEditInitiative} canEdit={canEdit(i)} />
          ))}
        </div>
      )}
    </div>
  );
}
