import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import InitiativeFilterBar from "../components/InitiativeFilterBar";
import { DEPTS, USERS, UPROF, chefOf, deptById } from "../data/reference";
import {
  avgTaux,
  benItems,
  budPct,
  currentPhase,
  deptInstances,
  fmtM,
  health,
  isClosedInno,
  numv,
  prog,
  typeLbl,
  valeurProduite,
} from "../lib/domain";
import { PHASES } from "../data/templates";
import { fmt } from "../lib/dates";
import { EMPTY_INITIATIVE_FILTERS, filterInitiatives, type InitiativeFilters } from "../lib/initiativeFilters";

export default function DeptPage({ onOpenJalon, onOpenInitiative }: { onOpenJalon: (id: string) => void; onOpenInitiative: (code: string) => void }) {
  const { scopedInnos: innos, scopeDept } = useStore();
  const myDept = scopeDept;
  const [sel, setSel] = useState(DEPTS[0]?.id || "");
  const [deptSection, setDeptSection] = useState<"activites" | "instances" | "resultats" | "membres">("activites");
  const [filters, setFilters] = useState<InitiativeFilters>({ ...EMPTY_INITIATIVE_FILTERS });
  const deptId = myDept || sel;
  const dep = deptById(deptId);

  const L = useMemo(() => filterInitiatives(innos.filter((i) => i.dept === deptId), filters), [innos, deptId, filters]);
  const run = L.filter((i) => !isClosedInno(i));
  const inst = useMemo(() => deptInstances(L), [L]);
  const bv = L.reduce((a, i) => a + (numv(i.bv) || 0), 0);
  const bc = L.reduce((a, i) => a + (numv(i.bc) || 0), 0);
  const val = L.reduce((a, i) => a + (valeurProduite(i) || 0), 0);
  const objs = L.flatMap((i) => benItems(i).map((x) => x.obj));
  const att = avgTaux(objs);
  const chef = dep ? chefOf(dep.id) : undefined;
  const members = USERS.filter((u) => u.dept === deptId);

  if (!dep) {
    return (
      <div className="placeholder-screen">
        <h1>Aucun département</h1>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Suivi par département</span>
          <h1>{dep.lib}</h1>
          <p className="lead">
            {dep.dir ? dep.dir + " · " : ""}Chef de département : {chef ? chef.nom : "à désigner"}. Activités,
            instances et résultats des initiatives portées par les membres du département.
          </p>
        </div>
        {myDept ? (
          <span className="auto-chip">
            <i></i>Votre département
          </span>
        ) : (
          <label className="fb">
            Département
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              {DEPTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.lib}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <InitiativeFilterBar items={innos.filter((i) => i.dept === deptId)} filters={filters} setFilters={setFilters} flags={{ ini: false, resp: false, charte: false }} />

      <div className="summary s6">
        <div className="sum">
          <span className="v">
            {run.length} / {L.length}
          </span>
          <span className="k">Initiatives en cours</span>
        </div>
        <div className="sum late">
          <span className="v">{L.filter((i) => health(i)[1] === "En retard").length}</span>
          <span className="k">En retard</span>
        </div>
        <div className="sum">
          <span className="v">{inst.length}</span>
          <span className="k">Instances en attente</span>
        </div>
        <div className="sum">
          <span className="v">{bv ? Math.round((100 * bc) / bv) + " %" : "—"}</span>
          <span className="k">Budget consommé</span>
        </div>
        <div className="sum">
          <span className="v">{att == null ? "—" : att + " %"}</span>
          <span className="k">Atteinte moyenne</span>
        </div>
        <div className="sum ok">
          <span className="v">{val ? fmtM(val) + " XAF" : "—"}</span>
          <span className="k">Valeur produite</span>
        </div>
      </div>

      <nav className="subnav" aria-label="Tableaux du département">
        <button type="button" className={deptSection === "activites" ? "active" : ""} onClick={() => setDeptSection("activites")}>
          Activités
        </button>
        <button type="button" className={deptSection === "instances" ? "active" : ""} onClick={() => setDeptSection("instances")}>
          Instances
        </button>
        <button type="button" className={deptSection === "resultats" ? "active" : ""} onClick={() => setDeptSection("resultats")}>
          Résultats
        </button>
        <button type="button" className={deptSection === "membres" ? "active" : ""} onClick={() => setDeptSection("membres")}>
          Membres
        </button>
      </nav>

      <div className="panel" style={{ display: deptSection === "activites" ? "block" : "none" }}>
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Activités</h2>
          <p className="sub">Initiatives portées par les membres du département</p>
        </div>
        <div className="tbl-wrap">
          <table className="vt">
            <thead>
              <tr>
                <th>Initiative</th>
                <th>Phase</th>
                <th>Avancement</th>
                <th>Santé</th>
                <th>Prochaine étape</th>
                <th>Budget</th>
              </tr>
            </thead>
            <tbody>
              {L.length === 0 && (
                <tr>
                  <td colSpan={6} className="hint">
                    Aucune initiative pour ce département.
                  </td>
                </tr>
              )}
              {L.map((i) => {
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
                        {typeLbl(i)} · porteur {i.porteur}
                      </div>
                    </td>
                    <td>{PHASES[currentPhase(i)]}</td>
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
                            {fmt(nx.due)}
                          </div>
                        </>
                      ) : (
                        "Tous les jalons validés"
                      )}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ display: deptSection === "instances" ? "block" : "none" }}>
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Instances</h2>
          <p className="sub">Ce qui attend une action ou une décision</p>
        </div>
        {inst.length === 0 ? (
          <div className="empty">
            <b>Aucune instance</b>
            Rien n'attend d'action dans ce département.
          </div>
        ) : (
          inst.map((x, k) => (
            <div className={`inst${x.late ? " late" : ""}`} key={k}>
              <span className={`chip ${x.late ? "c-en_retard" : "c-a_venir"}`}>{x.k}</span>
              <div>
                <b>{x.i.code}</b> {x.i.titre}
                <div className="hint" style={{ margin: "2px 0 0" }}>
                  {x.t}
                </div>
              </div>
              <button type="button" className="btn-ghost sm" onClick={() => (x.k === "Bénéfice à mesurer" || x.k === "Recommandation en retard" ? onOpenInitiative(x.i.code) : onOpenJalon(x.i.jalons.find((j) => j.st !== "valide")?.id || x.i.jalons[0].id))}>
                Ouvrir
              </button>
            </div>
          ))
        )}
      </div>

      <div className="panel" style={{ display: deptSection === "resultats" ? "block" : "none" }}>
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Résultats</h2>
          <p className="sub">Bénéfices et objectifs des recommandations, valeur produite rapportée aux dépenses</p>
        </div>
        <div className="tbl-wrap">
          <table className="vt">
            <thead>
              <tr>
                <th>Initiative</th>
                <th>Suivis</th>
                <th>Atteints</th>
                <th>Atteinte moyenne</th>
                <th>Valeur produite</th>
                <th>Consommé</th>
                <th>Ratio</th>
              </tr>
            </thead>
            <tbody>
              {L.length === 0 && (
                <tr>
                  <td colSpan={7} className="hint">
                    Aucun résultat.
                  </td>
                </tr>
              )}
              {L.map((i) => {
                const it = benItems(i);
                const o = it.map((x) => x.obj);
                const a = avgTaux(o);
                const ok = it.filter((x) => x.st === "atteint").length;
                const v = valeurProduite(i);
                const c = numv(i.bc);
                return (
                  <tr key={i.code}>
                    <td>
                      <button type="button" className="linkish" onClick={() => onOpenInitiative(i.code)}>
                        {i.code}
                      </button>{" "}
                      {i.titre}
                    </td>
                    <td className="mono">{it.length}</td>
                    <td className="mono">{ok}</td>
                    <td>{a == null ? <span className="hint">Non mesuré</span> : `${a} %`}</td>
                    <td className="mono">{v ? fmtM(v) + " XAF" : "—"}</td>
                    <td className="mono">{c ? fmtM(c) + " XAF" : "—"}</td>
                    <td className="mono">{v && c ? "× " + (Math.round((v / c) * 100) / 100).toLocaleString("fr-FR") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ display: deptSection === "membres" ? "block" : "none" }}>
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Membres</h2>
          <p className="sub">Utilisateurs rattachés au département par l'administrateur</p>
        </div>
        <div className="members">
          {members.length === 0 && <div className="empty">Aucun membre : l'administrateur rattache les utilisateurs dans « Départements et utilisateurs ».</div>}
          {members.map((u) => (
            <div className="mem" key={u.id}>
              <b>{u.nom}</b>
              <span>{UPROF[u.prof]}</span>
              <span className="mono">{innos.filter((i) => i.porteurId === u.id).length} initiative(s) portée(s)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
