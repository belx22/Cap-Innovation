import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import HBars from "../components/HBars";
import Meter from "../components/Meter";
import { TODAY_SHORT_LABEL, TODAY, d, fmt, fmtY, iso } from "../lib/dates";
import {
  MEPRX,
  STAT,
  avgTaux,
  benItems,
  currentPhase,
  deptInstances,
  finTarget,
  fmtM,
  endOf,
  perfOf,
  prog,
  statusOf,
  typeKey,
  typeLbl,
  valeurProduite,
} from "../lib/domain";
import { DEPTS, PILIERS, PROGS, USERS, deptName } from "../data/reference";
import { PHASES, TYPES } from "../data/templates";
import type { Initiative } from "../data/types";

interface Filters {
  type: string;
  dept: string;
  porteur: string;
  resp: string;
  phase: string;
  pil: string;
  prog: string;
  from: string;
  to: string;
}

export default function DashboardPage({ onOpenInitiative }: { onOpenInitiative: (code: string) => void }) {
  const { scopedInnos: innos } = useStore();
  const [filters, setFilters] = useState<Filters>({ type: "", dept: "", porteur: "", resp: "", phase: "", pil: "", prog: "", from: "", to: "" });
  const [dashboardSection, setDashboardSection] = useState<"mep" | "gen" | "dept" | "porteur">("mep");

  const L = useMemo(
    () =>
      innos.filter(
        (i) =>
          (!filters.type || typeKey(i) === filters.type) &&
          (!filters.dept || i.dept === filters.dept) &&
          (!filters.porteur || i.porteurId === filters.porteur) &&
          (!filters.resp || [i.metier, i.benef, i.resIT].includes(filters.resp)) &&
          (!filters.phase || String(currentPhase(i)) === filters.phase) &&
          (!filters.pil || i.pil === filters.pil) &&
          (!filters.prog || i.prog === filters.prog) &&
          (!filters.from || endOf(i) >= filters.from) &&
          (!filters.to || (i.deb || i.start || i.jalons[0]?.due || "") <= filters.to)
      ),
    [innos, filters]
  );

  const P = useMemo(() => perfOf(L), [L]);
  const pc = (v: number | null) => (v == null ? "—" : v + " %");
  const T = iso(TODAY);

  const avance = P.closed.filter((j) => (j.fin || j.due) < j.due).length;
  const atemps = P.closed.filter((j) => (j.fin || j.due) === j.due).length;

  const months = useMemo(() => {
    const out: string[] = [];
    for (let k = 5; k >= 0; k--) {
      const m = new Date(TODAY.getFullYear(), TODAY.getMonth() - k, 1, 12);
      out.push(iso(m).slice(0, 7));
    }
    return out;
  }, []);
  const cnt = months.map((m) => P.closed.filter((j) => (j.fin || j.due).slice(0, 7) === m).length);
  const mx = Math.max(1, ...cnt);

  const byStatus = useMemo(() => {
    const out: Record<string, Initiative[]> = {};
    STAT.forEach(([k]) => (out[k] = L.filter((i) => statusOf(i) === k)));
    return out;
  }, [L]);

  const inst = useMemo(() => deptInstances(L), [L]);
  const IK = ["Étape à clôturer", "Justificatif à déposer", "Bénéfice à mesurer", "Recommandation en retard", "Difficulté signalée"];

  const diff = useMemo(
    () =>
      L.filter((i) => ["Bloquée", "En retard", "Suspendue"].includes(statusOf(i))).sort(
        (a, b) =>
          ["Bloquée", "En retard", "Suspendue"].indexOf(statusOf(a)) -
          ["Bloquée", "En retard", "Suspendue"].indexOf(statusOf(b))
      ),
    [L]
  );

  const items = useMemo(() => L.flatMap((i) => benItems(i)), [L]);
  const att = avgTaux(items.map((x) => x.obj));
  const tgt = L.reduce((a, i) => a + finTarget(i), 0);

  const DV = useMemo(
    () =>
      DEPTS.map((D) => {
        const LL = L.filter((i) => i.dept === D.id);
        return { D, t: LL.reduce((a, i) => a + finTarget(i), 0), v: LL.reduce((a, i) => a + (valeurProduite(i) || 0), 0) };
      }).filter((x) => x.t || x.v),
    [L]
  );
  const vmax = Math.max(1, ...DV.map((x) => Math.max(x.t, x.v)));

  const BS: [string, string, string][] = [
    ["attente", "Mesure à venir", "idle"],
    ["amesurer", "À mesurer", "warn"],
    ["partiel", "Partiellement atteints", "warn"],
    ["atteint", "Atteints", "ok"],
  ];

  const mep = useMemo(
    () =>
      L.map((i) => ({ i, j: [...i.jalons].reverse().find((j) => j.st === "valide" && MEPRX.test(j.t)) }))
        .filter((x) => x.j || currentPhase(x.i) === 4)
        .sort((a, b) => String(b.j?.fin || "").localeCompare(String(a.j?.fin || ""))),
    [L]
  );
  const gen = useMemo(
    () => L.filter((i) => (currentPhase(i) === 2 || currentPhase(i) === 3) && statusOf(i) !== "Terminée"),
    [L]
  );

  const porteurUsers = useMemo(() => USERS.filter((u) => innos.some((i) => i.porteurId === u.id)), [innos]);
  const responsibles = useMemo(
    () => [...new Set(innos.flatMap((i) => [i.metier, i.benef, i.resIT]).filter(Boolean))].sort(),
    [innos]
  );
  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Pilotage de la direction · accessible à tous</span>
          <h1>Dashboard</h1>
          <p className="lead">
            Performance, instances et suspens, valeur produite et solutions livrées, calculés en continu à partir des
            initiatives.
          </p>
        </div>
        <span className="auto-chip">
          <i></i>Données au {TODAY_SHORT_LABEL}
        </span>
      </div>

      <div className="fbar">
        <label className="fb">
          Type
          <select value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
            <option value="">Tous</option>
            {TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="fb">
          Département
          <select value={filters.dept} onChange={(e) => setFilter("dept", e.target.value)}>
            <option value="">Tous</option>
            {DEPTS.map((dep) => (
              <option key={dep.id} value={dep.id}>
                {dep.lib}
              </option>
            ))}
          </select>
        </label>
        <label className="fb">
          Porteur
          <select value={filters.porteur} onChange={(e) => setFilter("porteur", e.target.value)}>
            <option value="">Tous</option>
            {porteurUsers.map((u) => <option key={u.id} value={u.id}>{u.nom} · {deptName(u.dept)}</option>)}
          </select>
        </label>
        <label className="fb">
          Responsable
          <select value={filters.resp} onChange={(e) => setFilter("resp", e.target.value)}>
            <option value="">Tous</option>
            {responsibles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="fb">
          Phase
          <select value={filters.phase} onChange={(e) => setFilter("phase", e.target.value)}>
            <option value="">Toutes</option>
            {PHASES.map((label, k) => <option key={k} value={String(k)}>{label}</option>)}
          </select>
        </label>
        <label className="fb">
          Pilier
          <select value={filters.pil} onChange={(e) => setFilter("pil", e.target.value)}>
            <option value="">Tous</option>
            {PILIERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
        </label>
        <label className="fb">
          Programme
          <select value={filters.prog} onChange={(e) => setFilter("prog", e.target.value)}>
            <option value="">Tous</option>
            {PROGS.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.lib}</option>)}
          </select>
        </label>
        <label className="fb">Période du<input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} /></label>
        <label className="fb">au<input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} /></label>
        {activeFilters > 0 && <button type="button" className="btn-ghost sm" onClick={() => setFilters({ type: "", dept: "", porteur: "", resp: "", phase: "", pil: "", prog: "", from: "", to: "" })}>Effacer les filtres ({activeFilters})</button>}
        <span className="fcount">
          {L.length} initiative{L.length > 1 ? "s" : ""}
        </span>
      </div>

      <h2 className="dh">Performance</h2>
      <div className="summary s6">
        <Tile v={pc(P.exec)} k="Taux d'exécution" sub={`${P.echues.filter((j) => j.st === "valide").length} étapes clôturées sur ${P.echues.length} échues`} />
        <Tile v={pc(P.delais)} k="Délais respectés" sub={`${P.onTime.length} sur ${P.closed.length} étapes clôturées`} />
        <Tile v={P.retard == null ? "—" : P.retard + " j"} k="Retard moyen" sub={`${P.openLate.length} étape(s) ouverte(s) en retard`} cls={P.openLate.length ? "late" : ""} />
        <Tile v={P.bv ? Math.round((100 * P.bc) / P.bv) + " %" : "—"} k="Budget consommé" sub={P.bv ? `${fmtM(P.bc)} / ${fmtM(P.bv)} XAF` : ""} />
        <Tile v={P.val ? fmtM(P.val) : "—"} k="Valeur produite (XAF)" sub={P.val && P.bc ? `ratio valeur / dépense × ${(Math.round((P.val / P.bc) * 100) / 100).toLocaleString("fr-FR")}` : ""} cls="ok" />
        <Tile v={`${L.filter((i) => statusOf(i) !== "Terminée").length} / ${L.length}`} k="Initiatives actives" sub={`${L.filter((i) => statusOf(i) === "Terminée").length} terminée(s)`} />
      </div>

      <div className="dgrid">
        <div className="panel">
          <div className="pad dh-p">
            <h3>Respect des délais</h3>
            <p className="sub">Étapes clôturées selon l'écart à l'échéance, et étapes ouvertes déjà échues</p>
          </div>
          <div className="pad">
            <HBars
              rows={[
                { l: "Clôturées en avance", v: avance, cls: "ok" },
                { l: "Clôturées à la date", v: atemps, cls: "ok" },
                { l: "Clôturées en retard", v: P.closedLate.length, cls: "warn" },
                { l: "Ouvertes et échues", v: P.openLate.length, cls: "late" },
                { l: "À venir", v: P.J.filter((j) => j.st !== "valide" && j.due >= T).length, cls: "idle" },
              ]}
              fmtv={(v) => v + " étape" + (v > 1 ? "s" : "")}
            />
          </div>
        </div>
        <div className="panel">
          <div className="pad dh-p">
            <h3>Rythme d'exécution</h3>
            <p className="sub">Étapes clôturées par mois sur les six derniers mois</p>
          </div>
          <div className="pad">
            <div className="vb">
              {months.map((m, k) => (
                <div className="vb-c" key={m} title={`${d(m + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} : ${cnt[k]} étape(s) clôturée(s)`}>
                  <span className="vb-v">{cnt[k]}</span>
                  <span className="vb-t">
                    <i style={{ height: `${(100 * cnt[k]) / mx}%` }}></i>
                  </span>
                  <span className="vb-l">{d(m + "-01").toLocaleDateString("fr-FR", { month: "short" })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <h2 className="dh">Instances et suspens</h2>
      <div className="stat-row">
        {STAT.map(([k, c]) => (
          <div className="st-t" key={k}>
            <span className={`chip ${c}`}>{k}</span>
            <b>{byStatus[k]?.length || 0}</b>
            <span className="hint" style={{ margin: 0 }}>
              {byStatus[k]?.map((i) => i.code).join(", ") || "—"}
            </span>
          </div>
        ))}
      </div>
      <div className="dgrid">
        <div className="panel">
          <div className="pad dh-p">
            <h3>Suspens à traiter</h3>
            <p className="sub">Ce qui attend une action ou une décision</p>
          </div>
          <div className="pad">
            <HBars rows={IK.map((k) => ({ l: k, v: inst.filter((x) => x.k === k).length, cls: k === "Recommandation en retard" || k === "Difficulté signalée" ? "late" : "" }))} fmtv={(v) => String(v)} />
          </div>
        </div>
        <div className="panel">
          <div className="pad dh-p">
            <h3>Initiatives en difficulté</h3>
            <p className="sub">Bloquées, en retard ou suspendues, avec la cause</p>
          </div>
          {diff.length === 0 && (
            <div className="empty">
              <b>Aucune initiative en difficulté</b>
            </div>
          )}
          {diff.map((i) => {
            const st = statusOf(i);
            const late = i.jalons.filter((j) => j.st !== "valide" && j.due < T);
            const j = late[0];
            const cause =
              st === "Suspendue"
                ? `Depuis le ${fmt(i.susp!.at)} : ${i.susp!.motif}`
                : j
                ? `« ${j.t} » en retard${j.difs.length ? ` · ${j.difs[j.difs.length - 1].txt}` : ""}`
                : "";
            return (
              <div className={`inst${st !== "Suspendue" ? " late" : ""}`} key={i.code}>
                <span className={`chip ${STAT.find((x) => x[0] === st)?.[1]}`}>{st}</span>
                <div>
                  <button type="button" className="linkish" onClick={() => onOpenInitiative(i.code)}>
                    {i.code} · {i.titre}
                  </button>
                  <div className="hint" style={{ margin: "2px 0 0" }}>
                    {cause} · {i.porteur}, {deptName(i.dept)}
                  </div>
                </div>
                <span></span>
              </div>
            );
          })}
        </div>
      </div>

      <h2 className="dh">Valeur et résultats</h2>
      <div className="summary s4">
        <Tile v={tgt ? fmtM(tgt) : "—"} k="Valeur attendue (XAF)" sub="cibles financières des bénéfices et recommandations" />
        <Tile v={P.val ? fmtM(P.val) : "—"} k="Valeur produite (XAF)" sub={tgt ? `${Math.round((100 * P.val) / tgt)} % de la valeur attendue` : ""} cls="ok" />
        <Tile v={String(items.length)} k="Bénéfices et objectifs suivis" sub={`${items.filter((x) => x.st === "atteint").length} atteint(s), ${items.filter((x) => x.st === "partiel").length} partiel(s)`} />
        <Tile v={att == null ? "—" : att + " %"} k="Atteinte moyenne" sub="sur les éléments mesurés" />
      </div>
      <div className="dgrid">
        <div className="panel">
          <div className="pad dh-p">
            <h3>Valeur attendue et valeur produite par département</h3>
            <p className="sub">Barre claire : valeur attendue (cibles XAF) ; barre foncée : valeur produite mesurée</p>
          </div>
          <div className="pad">
            {DV.length === 0 && <div className="empty">Aucune valeur financière attendue pour cette sélection.</div>}
            {DV.length > 0 && (
              <>
                <div className="hb">
                  {DV.map((x) => (
                    <div className="hb-r two" key={x.D.id} title={`${x.D.lib} : attendu ${fmtM(x.t)} XAF, produit ${fmtM(x.v)} XAF`}>
                      <span className="hb-l">{x.D.lib}</span>
                      <span className="hb-t">
                        <i className="tgt" style={{ width: `${(100 * x.t) / vmax}%` }}></i>
                        <i className="val" style={{ width: `${(100 * x.v) / vmax}%` }}></i>
                      </span>
                      <span className="hb-v">
                        {fmtM(x.v)} / {fmtM(x.t)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="lg">
                  <span>
                    <i className="tgt"></i>Valeur attendue
                  </span>
                  <span>
                    <i className="val"></i>Valeur produite
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="pad dh-p">
            <h3>Bénéfices attendus</h3>
            <p className="sub">Bénéfices et objectifs de recommandations, par état</p>
          </div>
          <div className="pad">
            <HBars rows={BS.map(([k, l, c]) => ({ l, v: items.filter((x) => x.st === k).length, cls: c }))} fmtv={(v) => String(v)} />
          </div>
        </div>
      </div>

      <h2 className="dh">Solutions livrées</h2>
      <nav className="subnav" aria-label="Tableaux du dashboard">
        <button type="button" className={dashboardSection === "mep" ? "active" : ""} onClick={() => setDashboardSection("mep")}>
          Mises en production
        </button>
        <button type="button" className={dashboardSection === "gen" ? "active" : ""} onClick={() => setDashboardSection("gen")}>
          À généraliser
        </button>
        <button type="button" className={dashboardSection === "dept" ? "active" : ""} onClick={() => setDashboardSection("dept")}>
          Par département
        </button>
        <button type="button" className={dashboardSection === "porteur" ? "active" : ""} onClick={() => setDashboardSection("porteur")}>
          Par porteur
        </button>
      </nav>
      <div className="dgrid dashboard-table-grid">
        <div className="panel" style={{ display: dashboardSection === "mep" ? "block" : "none" }}>
          <div className="pad dh-p">
            <h3>Mises en production</h3>
            <p className="sub">Étape de mise en production, de lancement ou de déploiement clôturée</p>
          </div>
          <div className="tbl-wrap">
            {mep.length === 0 && <div className="empty">Aucune mise en production sur la sélection.</div>}
            {mep.length > 0 && (
              <table className="vt">
                <tbody>
                  {mep.map(({ i, j }) => (
                    <tr key={i.code}>
                      <td>
                        <button type="button" className="linkish" onClick={() => onOpenInitiative(i.code)}>
                          {i.code} · {i.titre}
                        </button>
                        <div className="hint" style={{ margin: "2px 0 0" }}>
                          {typeLbl(i)} · {deptName(i.dept)}
                        </div>
                      </td>
                      <td>
                        {j ? (
                          <>
                            {j.t}
                            <div className="hint" style={{ margin: "2px 0 0" }}>
                              le {fmtY(j.fin || j.due)}
                            </div>
                          </>
                        ) : (
                          "Généralisée"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="panel" style={{ display: dashboardSection === "gen" ? "block" : "none" }}>
          <div className="pad dh-p">
            <h3>À généraliser</h3>
            <p className="sub">Initiatives en pilote ou en déploiement, non encore généralisées</p>
          </div>
          <div className="tbl-wrap">
            {gen.length === 0 && <div className="empty">Aucune solution à généraliser sur la sélection.</div>}
            {gen.length > 0 && (
              <table className="vt">
                <tbody>
                  {gen.map((i) => {
                    const nx = i.jalons.find((j) => j.st !== "valide");
                    return (
                      <tr key={i.code}>
                        <td>
                          <button type="button" className="linkish" onClick={() => onOpenInitiative(i.code)}>
                            {i.code} · {i.titre}
                          </button>
                          <div className="hint" style={{ margin: "2px 0 0" }}>
                            {PHASES[currentPhase(i)]} · {deptName(i.dept)}
                          </div>
                        </td>
                        <td className="mono">
                          <span className="minibar">
                            <i style={{ width: `${prog(i)}%` }}></i>
                          </span>
                          {prog(i)} %
                        </td>
                        <td>{nx ? `${nx.t} · ${fmt(nx.due)}` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <h2 className="dh">Performance par département et par porteur</h2>
      <div className="panel" style={{ display: dashboardSection === "dept" ? "block" : "none" }}>
        <div className="tbl-wrap">
          <table className="vt ds-t">
            <thead>
              <tr>
                <th>Département</th>
                <th>Initiatives</th>
                <th>Terminées</th>
                <th>Taux d'exécution</th>
                <th>Délais respectés</th>
                <th>Retard moyen</th>
                <th>Budget consommé</th>
                <th>Valeur produite</th>
                <th>Suspens</th>
              </tr>
            </thead>
            <tbody>
              {DEPTS.map((D) => {
                const LL = L.filter((i) => i.dept === D.id);
                if (!LL.length) return null;
                const p = perfOf(LL);
                return (
                  <tr key={D.id}>
                    <td>
                      <b>{D.lib}</b>
                    </td>
                    <td className="mono">{LL.length}</td>
                    <td className="mono">{LL.filter((i) => statusOf(i) === "Terminée").length}</td>
                    <td>{p.exec == null ? "—" : <Meter value={p.exec} />}</td>
                    <td>{p.delais == null ? "—" : <Meter value={p.delais} />}</td>
                    <td className="mono">{p.retard == null ? "—" : p.retard + " j"}</td>
                    <td className="mono">{p.bv ? Math.round((100 * p.bc) / p.bv) + " %" : "—"}</td>
                    <td className="mono">{p.val ? fmtM(p.val) + " XAF" : "—"}</td>
                    <td className="mono">{deptInstances(LL).length}</td>
                  </tr>
                );
              })}
              {DEPTS.every((D) => !L.some((i) => i.dept === D.id)) && (
                <tr>
                  <td colSpan={9} className="hint">
                    Aucune initiative.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel" style={{ display: dashboardSection === "porteur" ? "block" : "none" }}>
        <div className="tbl-wrap">
          <table className="vt ds-t">
            <thead>
              <tr>
                <th>Porteur</th>
                <th>Département</th>
                <th>Initiatives</th>
                <th>Taux d'exécution</th>
                <th>Délais respectés</th>
                <th>Étapes en retard</th>
                <th>Suspens</th>
              </tr>
            </thead>
            <tbody>
              {porteurUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="hint">
                    Aucun porteur.
                  </td>
                </tr>
              )}
              {porteurUsers.map((u) => {
                const LL = L.filter((i) => i.porteurId === u.id);
                const p = perfOf(LL);
                return (
                  <tr key={u.id}>
                    <td>
                      <b>{u.nom}</b>
                    </td>
                    <td>{deptName(u.dept)}</td>
                    <td className="mono">{LL.length}</td>
                    <td>{p.exec == null ? "—" : <Meter value={p.exec} />}</td>
                    <td>{p.delais == null ? "—" : <Meter value={p.delais} />}</td>
                    <td className="mono">{p.openLate.length}</td>
                    <td className="mono">{deptInstances(LL).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dgrid">
        <div className="panel">
          <div className="pad dh-p">
            <h3>Répartition par type</h3>
          </div>
          <div className="pad">
            <HBars
              rows={TYPES.map(([k, l]) => ({ l, v: L.filter((i) => typeKey(i) === k).length })).filter((r) => r.v)}
              fmtv={(v) => v + " initiative" + (v > 1 ? "s" : "")}
            />
          </div>
        </div>
        <div className="panel">
          <div className="pad dh-p">
            <h3>Répartition par pilier stratégique</h3>
          </div>
          <div className="pad">
            <HBars
              rows={PILIERS.map((x) => ({ l: `${x.code} – ${x.lib}`, v: L.filter((i) => i.pil === x.id).length })).filter((r) => r.v)}
              fmtv={(v) => v + " initiative" + (v > 1 ? "s" : "")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ v, k, sub, cls }: { v: string; k: string; sub?: string; cls?: string }) {
  return (
    <div className={`sum${cls ? " " + cls : ""}`}>
      <span className="v">{v}</span>
      <span className="k">{k}</span>
      {sub && <span className="ks">{sub}</span>}
    </div>
  );
}
