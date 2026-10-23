import type { Initiative } from "../data/types";
import {
  avgTaux,
  budPct,
  charteOK,
  fmtM,
  health,
  isReco,
  normBens,
  prog,
  recoLate,
  tCls,
  typeLbl,
} from "../lib/domain";
import { deptName, pilOf, progOf, refLbl } from "../data/reference";
import { fmt } from "../lib/dates";
import { TEMPLATES } from "../data/templates";

export default function InitiativeCard({ i, onOpen, onEdit, canEdit }: { i: Initiative; onOpen: (code: string) => void; onEdit?: (code: string) => void; canEdit?: boolean }) {
  const h = health(i);
  const pr = prog(i);
  const nx = i.jalons.find((j) => j.st !== "valide");
  const pc = budPct(i);
  const tpl = TEMPLATES[i.type];
  const tchipClass = tpl?.short ? i.type : i.type;

  return (
    <div className="card">
      <div className="row">
        <span className="code">{i.code}</span>
        <span className={`tchip ${tchipClass}${i.it ? " it" : ""}`} title={typeLbl(i)}>
          {tpl?.short || typeLbl(i)}
        </span>
      </div>
      <h3>{i.titre}</h3>
      <div className="row strat">
        <span title={`${refLbl(pilOf(i.pil))} · ${refLbl(progOf(i.prog))}`}>
          {progOf(i.prog)?.code || "Sans programme"} · {pilOf(i.pil)?.code || "Sans pilier"}
        </span>
        {charteOK(i) && <span className="chip c-valide">Charte validée</span>}
      </div>
      <div className="bar">
        <i style={{ width: `${pr}%` }}></i>
      </div>
      <div className="row">
        <span className="mono">{pr} %</span>
        <span className={`chip ${h[0]}`}>{h[1]}</span>
      </div>
      <div className="row">
        <span>{nx ? `Prochain : ${nx.t} · ${fmt(nx.due)}` : "Tous les jalons validés"}</span>
      </div>
      <div className="row">
        <span>
          Porteur : {i.porteur}
          {i.dept ? ` · ${deptName(i.dept)}` : ""}
        </span>
      </div>
      {!!Number(i.bv) && pc != null && (
        <div className="row">
          <span className="bud-l">
            <span className={`minibar${pc > 100 ? " over" : ""}`}>
              <i style={{ width: `${Math.min(100, pc)}%` }}></i>
            </span>
            {fmtM(i.bc)} / {fmtM(i.bv)} XAF
          </span>
          {pc > 100 && <span className="chip c-en_retard">+{pc - 100} %</span>}
        </div>
      )}
      <div className="row">
        <span>
          Responsable métier : <b style={{ color: "var(--ink)", fontWeight: 600 }}>{i.metier || "Non désigné"}</b>
        </span>
      </div>
      {!isReco(i) && (
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start", gap: "4px 8px" }}>
          {normBens(i).length ? (
            <>
              <span>
                {i.bens!.length} bénéfice{i.bens!.length > 1 ? "s" : ""} attendu{i.bens!.length > 1 ? "s" : ""}
              </span>
              {i.jalons.every((j) => j.st === "valide") &&
                (avgTaux(i.bens!) != null ? (
                  <span className={`chip ${tCls(avgTaux(i.bens!)!)}`}>Atteinte {avgTaux(i.bens!)} %</span>
                ) : (
                  <span className="chip c-en_retard">À mesurer</span>
                ))}
            </>
          ) : (
            <span className="chip h-risk">Bénéfices à définir</span>
          )}
        </div>
      )}
      {isReco(i) && (
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start", gap: "4px 8px" }}>
          {i.recos && i.recos.length ? (
            <>
              <span>
                {i.recos.length} recommandation{i.recos.length > 1 ? "s" : ""} ·{" "}
                {i.recos.filter((r) => r.st === "realisee").length} mise(s) en œuvre
              </span>
              {i.recos.filter(recoLate).length > 0 && (
                <span className="chip c-en_retard">{i.recos.filter(recoLate).length} en retard</span>
              )}
            </>
          ) : (
            <span className="chip h-late" style={{ whiteSpace: "normal" }}>
              Recommandations à renseigner
            </span>
          )}
        </div>
      )}
      {i.jalons.reduce((a, j) => a + j.difs.length, 0) > 0 && (
        <div className="row">
          <span className="chip h-risk">
            {i.jalons.reduce((a, j) => a + j.difs.length, 0)} difficulté(s) signalée(s)
          </span>
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-start", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        <button type="button" className="btn-ghost steps-btn" onClick={() => onOpen(i.code)}>
          Planning et étapes
        </button>
        {canEdit && onEdit && <button type="button" className="btn-ghost sm" onClick={() => onEdit(i.code)}>Modifier l’initiative</button>}
      </div>
    </div>
  );
}
