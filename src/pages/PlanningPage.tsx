import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import InitiativeFilterBar from "../components/InitiativeFilterBar";
import InitiativeGantt from "../components/InitiativeGantt";
import { TODAY, TODAY_SHORT_LABEL, d, days, iso } from "../lib/dates";
import { charteOK, needsDecision, phaseLbl, typeLbl } from "../lib/domain";
import type { Initiative } from "../data/types";
import { EMPTY_INITIATIVE_FILTERS, filterInitiatives, type InitiativeFilters } from "../lib/initiativeFilters";

export default function PlanningPage({
  onOpenJalon,
}: {
  onOpenJalon: (id: string) => void;
}) {
  const { scopedInnos: innos } = useStore();
  const [filters, setFilters] = useState<InitiativeFilters>({ ...EMPTY_INITIATIVE_FILTERS });
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const LIST = useMemo(() => filterInitiatives(innos, filters), [innos, filters]);
  const selected = LIST.find((i) => i.code === selectedCode) || null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedCode) setSelectedCode(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedCode]);

  const chart = useMemo(() => {
    const source = LIST.length ? LIST : innos;
    const lastDue = source.flatMap((i) => i.jalons.map((j) => j.due)).sort().pop() || iso(TODAY);
    const ld = d(lastDue);
    const endM = new Date(ld.getFullYear(), ld.getMonth() + 1, 0, 12);
    const start = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1, 12);
    const yearEnd = new Date(TODAY.getFullYear(), 11, 31, 12);
    let end = endM < yearEnd ? yearEnd : endM;
    if (end <= start) end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
    const span = days(start, end);
    const X = (s: string) => (days(start, d(s)) / span) * 100;
    const months: string[] = [];
    const mn: string[] = [];
    for (let m = new Date(start); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1, 12)) {
      months.push(iso(m));
      const lab = m.toLocaleDateString("fr-FR", { month: "short" });
      mn.push(m.getMonth() === 0 ? lab + " " + String(m.getFullYear()).slice(2) : lab);
    }
    const tX = (days(start, TODAY) / span) * 100;
    return { start, end, X, months, mn, tX, E0: iso(end), S0: iso(start) };
  }, [LIST, innos]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Planning du portefeuille</span>
          <h1>Planning des jalons</h1>
          <p className="lead">
            Cliquez sur un jalon pour l'ouvrir, ou sur le nom d'une initiative pour afficher son diagramme détaillé.
            Les jalons entourés attendent votre validation.
          </p>
        </div>
      </div>

      {selected && (
        <>
          <div className="scrim" onClick={() => setSelectedCode(null)} />
          <aside className="drawer s" role="dialog" aria-modal="true" aria-labelledby="gantt-title">
            <div className="d-head">
              <div>
                <span className="eyebrow">Détail du planning</span>
                <h2 id="gantt-title">{selected.titre}</h2>
                <p className="sub">{selected.code} · {selected.jalons.length} jalon(s)</p>
              </div>
              <button className="x" aria-label="Fermer" onClick={() => setSelectedCode(null)}>
                ×
              </button>
            </div>
            <div className="d-body">
              <InitiativeGantt i={selected} />
            </div>
          </aside>
        </>
      )}

      <InitiativeFilterBar items={innos} filters={filters} setFilters={setFilters} />
      <span className="fcount">{LIST.length} initiative(s) selon les filtres</span>

      <div className="panel">
        <div className="gantt-wrap">
          <div className="gantt" style={{ minWidth: 230 + chart.months.length * 120 }}>
            <div className="g-cell" style={{ borderTop: 0, minHeight: 34, padding: "8px 14px", fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)" }}>
              Initiative
            </div>
            <div className="months">
              {chart.months.map((m, k) => (
                <span key={m} style={{ left: `${chart.X(m)}%` }}>
                  {chart.mn[k]}
                </span>
              ))}
              <div className="today" style={{ left: `${chart.tX}%` }}></div>
            </div>
            {LIST.length === 0 && (
              <div className="g-cell" style={{ gridColumn: "1/-1", color: "var(--muted)" }}>
                Aucune initiative ne correspond aux filtres.
              </div>
            )}
            {LIST.map((i) => (
              <GanttRow key={i.code} i={i} chart={chart} onOpenJalon={onOpenJalon} onSelectInitiative={setSelectedCode} />
            ))}
          </div>
        </div>
        <div className="legend">
          <span>
            <i style={{ background: "var(--ok)" }}></i>Clôturée
          </span>
          <span>
            <i style={{ background: "var(--todo)" }}></i>À valider
          </span>
          <span>
            <i style={{ background: "var(--late)" }}></i>En retard
          </span>
          <span>
            <i style={{ background: "var(--warn)" }}></i>Complément demandé
          </span>
          <span>
            <i style={{ background: "var(--idle-bg)", border: "2px solid var(--idle)" }}></i>À venir
          </span>
          <span>
            <i style={{ width: 2, height: 12, transform: "none", borderRadius: 0, background: "var(--accent)" }}></i>
            Aujourd'hui, {TODAY_SHORT_LABEL}
          </span>
        </div>
      </div>
    </div>
  );
}

function GanttRow({
  i,
  chart,
  onOpenJalon,
  onSelectInitiative,
}: {
  i: Initiative;
  chart: { X: (s: string) => number; tX: number; months: string[]; S0: string; E0: string };
  onOpenJalon: (id: string) => void;
  onSelectInitiative: (code: string) => void;
}) {
  const { X, tX, months, S0, E0 } = chart;
  const first = i.jalons[0].due < S0 ? S0 : i.jalons[0].due;
  const last = i.jalons[i.jalons.length - 1].due < S0 ? S0 : i.jalons[i.jalons.length - 1].due;
  const lastVal = [...i.jalons].reverse().find((j) => j.st === "valide");
  const doneW = lastVal ? ((X(lastVal.due) - X(first)) / (X(last) - X(first) || 1)) * 100 : 0;

  return (
    <>
      <div className="g-cell g-namecell">
        <button type="button" className="linkbtn" title="Afficher le diagramme détaillé" onClick={() => onSelectInitiative(i.code)}>
          <div className="g-name">
            <small>
              {i.code} · {typeLbl(i)} · {phaseLbl(i)}
              {charteOK(i) ? " · charte validée" : ""}
            </small>
            {i.titre}
          </div>
        </button>
      </div>
      <div className="g-track">
        {months.slice(1).map((m) => (
          <span key={m} className="gridline" style={{ left: `${X(m)}%` }}></span>
        ))}
        <span className="today" style={{ left: `${tX}%` }}></span>
        <span className="span" style={{ left: `${X(first)}%`, width: `${Math.max(0, Math.min(100, X(last)) - X(first))}%` }}>
          <i style={{ width: `${doneW}%` }}></i>
        </span>
        {i.jalons
          .filter((j) => j.due >= S0 && j.due <= E0)
          .map((j) => {
            const a = needsDecision(j);
            return (
              <button
                key={j.id}
                type="button"
                className={`ms ${j.st}${a ? " act-able" : ""}`}
                style={{ left: `${X(j.due)}%` }}
                title={`${j.t} · prévue ${j.due}${j.fin ? " · fin réelle " + j.fin : ""}`}
                aria-label={`${j.t}, ${j.due}`}
                onClick={() => onOpenJalon(j.id)}
              />
            );
          })}
      </div>
    </>
  );
}
