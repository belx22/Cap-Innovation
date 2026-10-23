import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import InitiativeFilterBar from "../components/InitiativeFilterBar";
import { actions as computeActions } from "../lib/domain";
import { fmt } from "../lib/dates";
import type { Initiative, Jalon, FichierJoint } from "../data/types";
import { EMPTY_INITIATIVE_FILTERS, filterInitiatives, type InitiativeFilters } from "../lib/initiativeFilters";

export default function JustifsPage({ onOpenJalon }: { onOpenJalon: (id: string) => void }) {
  const { scopedInnos: innos } = useStore();
  const [filters, setFilters] = useState<InitiativeFilters>({ ...EMPTY_INITIATIVE_FILTERS });

  const scoped = useMemo(() => filterInitiatives(innos, filters), [innos, filters]);

  const miss = useMemo(
    () => computeActions(scoped).filter((x) => x.kind === "just"),
    [scoped]
  );

  const rows = useMemo(() => {
    const out: { i: Initiative; j: Jalon; f: FichierJoint }[] = [];
    scoped.forEach((i) => i.jalons.forEach((j) => j.f.forEach((f) => out.push({ i, j, f }))));
    return out.sort((a, b) => b.f.at.localeCompare(a.f.at));
  }, [scoped]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Pièces justificatives</span>
          <h1>Justificatifs</h1>
          <p className="lead">
            Chaque pièce déposée est contrôlée automatiquement (format, taille, lisibilité) puis rattachée au jalon
            concerné.
          </p>
        </div>
      </div>

      <InitiativeFilterBar items={innos} filters={filters} setFilters={setFilters} flags={{ type: false, phase: false, resp: false, charte: false }} />
      <span className="fcount">{scoped.length} initiative(s)</span>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>À déposer</h2>
          <p className="sub">Pièces exigées par un jalon échu ou à valider</p>
        </div>
        <div className="missing">
          {miss.length === 0 && (
            <div className="empty">
              <b>Aucune pièce manquante</b>
              Toutes les pièces attendues ont été déposées.
            </div>
          )}
          {miss.map(({ i, j }) => (
            <div className="miss" key={j.id}>
              <div>
                <b>{j.req}</b>
                <div className="sub">
                  {i.code} · {j.t} · échéance {fmt(j.due)}
                </div>
              </div>
              <button className="btn red" onClick={() => onOpenJalon(j.id)}>
                Déposer
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Déposés</h2>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Fichier</th>
                <th>Initiative</th>
                <th>Jalon</th>
                <th>Déposé le</th>
                <th>Contrôle</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--muted)" }}>
                    Aucune pièce ne correspond aux filtres.
                  </td>
                </tr>
              )}
              {rows.map(({ i, j, f }, k) => (
                <tr key={k}>
                  <td>
                    <span className="fname">
                      <span className="ext">{f.n.split(".").pop()}</span>
                      {f.url ? (
                        <a className="linkbtn" href={f.url} target="_blank" rel="noreferrer" download={f.n}>
                          {f.n}
                        </a>
                      ) : f.n}
                    </span>
                  </td>
                  <td className="mono">{i.code}</td>
                  <td>{j.t}</td>
                  <td className="mono">{fmt(f.at)}</td>
                  <td>{f.ok ? <span className="chip c-valide">Conforme</span> : <span className="chip c-a_venir">En cours</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
