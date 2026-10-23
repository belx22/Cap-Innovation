import { fmt } from "../lib/dates";
import { viewList } from "../lib/planning";
import type { Initiative } from "../data/types";

export default function InitiativeGantt({ i }: { i: Initiative }) {
  const rows = viewList(i);
  const total = Math.max(1, rows.reduce((sum, row) => sum + Math.max(1, row.dur), 0));
  let offset = 0;

  return (
    <section className="panel pad" aria-label={`Planning et étapes de ${i.titre}`}>
      <div className="clo-h">
        <b>Planning et étapes de l’initiative</b>
        <span className="sub">Chaque barre représente la durée prévisionnelle du jalon.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((row) => {
          const left = (offset / total) * 100;
          const width = Math.max(4, (row.dur / total) * 100);
          offset += Math.max(1, row.dur);
          return (
            <div key={row.id} style={{ display: "grid", gridTemplateColumns: "minmax(145px, 34%) 1fr", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.t}>
                {row.t}
              </span>
              <div style={{ position: "relative", height: 22, borderRadius: 5, background: "var(--surface-2)" }}>
                <i
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${width}%`,
                    top: 3,
                    height: 16,
                    borderRadius: 4,
                    background: row.st === "valide" ? "var(--ok)" : row.st === "en_retard" ? "var(--late)" : "var(--navy)",
                  }}
                  title={`${row.dur} jour(s) · échéance ${fmt(row.due)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
