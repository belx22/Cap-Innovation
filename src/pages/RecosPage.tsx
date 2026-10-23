import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import InitiativeFilterBar from "../components/InitiativeFilterBar";
import {
  avgTaux,
  fmtN,
  isReco,
  normRecos,
  numv,
  recoLate,
  suivi,
  tCls,
  tauxOf,
  typeLbl,
} from "../lib/domain";
import { fmt } from "../lib/dates";
import Meter from "../components/Meter";
import type { Initiative, Recommandation } from "../data/types";
import { fileToBase64 } from "../lib/fileUploadFlow";
import { USERS, deptName } from "../data/reference";
import { EMPTY_INITIATIVE_FILTERS, filterInitiatives, type InitiativeFilters } from "../lib/initiativeFilters";

const RST: Record<string, [string, string]> = {
  a_lancer: ["À lancer", "c-a_venir"],
  en_cours: ["En cours", "c-a_valider"],
  realisee: ["Mise en œuvre", "c-valide"],
  abandonnee: ["Abandonnée", "c-a_venir"],
};

type Filter = "toutes" | "retard" | "a_lancer" | "en_cours" | "realisee" | "abandonnee";

function sizeOf(file: File): string {
  const kb = file.size / 1024;
  return kb > 1024 ? (kb / 1024).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(kb)) + " Ko";
}

export function RecoItem({ i, r }: { i: Initiative; r: Recommandation }) {
  const { updateReco, addRecoSuivi, addRecoFile } = useStore();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const late = recoLate(r);
  const t = tauxOf(r);

  return (
    <div className={`rec${open ? " open" : ""}`}>
      <button type="button" className="rec-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="k">•</span>
        <span>
          <span className="rec-t">{r.txt}</span>
          <span className="sub">
            <b>{i.code}</b> · {r.resp || "Responsable à désigner"} · {r.ech ? <span className={late ? "late-txt" : ""}>échéance {fmt(r.ech)}</span> : "échéance à fixer"}
            {r.suivi.filter((x) => !x.auto).length ? ` · ${r.suivi.filter((x) => !x.auto).length} point(s) de suivi` : ""}
          </span>
          <span className="sub">
            {r.obj ? (
              <>
                Objectif : {r.obj}
                {numv(r.cib) != null ? ` · cible ${fmtN(r.cib)} ${r.unit || ""}` : ""}
                {numv(r.val) != null ? ` · atteint ${fmtN(r.val)} ${r.unit || ""}` : ""}
              </>
            ) : (
              "Objectif à préciser"
            )}
          </span>
        </span>
        <span className="chips">
          <span className={`chip ${RST[r.st][1]}`}>{RST[r.st][0]}</span>
          {late && <span className="chip c-en_retard">En retard</span>}
          {t != null && (
            <span className={`chip ${tCls(t)}`} title="Taux de réalisation de l'objectif">
              Réalisé {t} %
            </span>
          )}
        </span>
        <span className="chev" aria-hidden="true">
          ›
        </span>
      </button>
      {open && (
        <div className="rec-body">
          <div className="rec-grid">
            <label className="field" htmlFor={`${r.id}-st`}>
              Statut
              <select id={`${r.id}-st`} value={r.st} onChange={(e) => updateReco(i.code, r.id, { st: e.target.value as Recommandation["st"] })}>
                {Object.entries(RST).map(([v, [l]]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field f-resp" htmlFor={`${r.id}-resp`}>
              Responsable de mise en œuvre
              <select id={`${r.id}-resp`} value={r.resp || ""} onChange={(e) => updateReco(i.code, r.id, { resp: e.target.value })}>
                <option value="">Choisir un responsable…</option>
                {r.resp && !USERS.some((u) => u.nom === r.resp) && <option value={r.resp}>{r.resp} (valeur actuelle)</option>}
                {USERS.map((u) => <option key={u.id} value={u.nom}>{u.nom} · {deptName(u.dept)}</option>)}
              </select>
            </label>
            <label className="field" htmlFor={`${r.id}-ech`}>
              Échéance
              <input id={`${r.id}-ech`} type="date" defaultValue={r.ech} onChange={(e) => updateReco(i.code, r.id, { ech: e.target.value })} />
            </label>
          </div>
          <div className="obj open">
            <div className="obj-l">
              <b>Taux de réalisation de l'objectif</b>
            </div>
            <label className="field" htmlFor={`${r.id}-obj`}>
              Objectif visé
              <textarea id={`${r.id}-obj`} defaultValue={r.obj || ""} maxLength={200} rows={2} placeholder="Ex. Former 40 agents d'accueil à l'orientation digitale" onBlur={(e) => updateReco(i.code, r.id, { obj: e.target.value })} />
            </label>
            <div className="obj-grid">
              <label className="field" htmlFor={`${r.id}-dep`}>
                Valeur de départ
                <input id={`${r.id}-dep`} inputMode="decimal" defaultValue={r.dep || ""} placeholder="Facultatif" onBlur={(e) => updateReco(i.code, r.id, { dep: e.target.value })} />
              </label>
              <label className="field" htmlFor={`${r.id}-cib`}>
                Valeur cible
                <input id={`${r.id}-cib`} inputMode="decimal" defaultValue={r.cib || ""} placeholder="Ex. 40" onBlur={(e) => updateReco(i.code, r.id, { cib: e.target.value })} />
              </label>
              <label className="field" htmlFor={`${r.id}-unit`}>
                Unité
                <input id={`${r.id}-unit`} defaultValue={r.unit || ""} maxLength={30} placeholder="agents, min, %" onBlur={(e) => updateReco(i.code, r.id, { unit: e.target.value })} />
              </label>
            </div>
            <label className="field" htmlFor={`${r.id}-res`}>
              Résultats obtenus
              <textarea id={`${r.id}-res`} defaultValue={r.res || ""} maxLength={255} placeholder="Ce qui a concrètement été obtenu" onBlur={(e) => updateReco(i.code, r.id, { res: e.target.value })} />
            </label>
            <div className="obj-grid2">
              <label className="field" htmlFor={`${r.id}-val`}>
                Valeur atteinte
                <input id={`${r.id}-val`} inputMode="decimal" defaultValue={r.val || ""} placeholder="Ex. 38" onBlur={(e) => updateReco(i.code, r.id, { val: e.target.value })} />
              </label>
              <p className="hint" style={{ margin: 0, paddingBottom: 4 }}>
                {t == null ? "Renseignez la valeur cible et la valeur atteinte pour calculer le taux." : <Meter value={t} />}
              </p>
            </div>
          </div>
          {r.suivi.length > 0 ? (
            <div className="clo-txt">
              <span className="lbl">Historique du suivi</span>
              {[...r.suivi].reverse().map((x, k) => (
                <p key={k} className={x.auto ? "auto" : ""}>
                  <span className="nd">{fmt(x.at)}</span>
                  {x.txt}
                </p>
              ))}
            </div>
          ) : (
            <p className="hint">Aucun point de suivi pour l'instant.</p>
          )}
          {r.f.length > 0 && (
            <div className="files">
              {r.f.map((f, k) => (
                <div className="file" key={k}>
                  <span className="fname">
                    <span className="ext">{f.n.split(".").pop()}</span>
                    {f.url ? <a className="linkbtn" href={f.url} target="_blank" rel="noreferrer" download={f.n}>{f.n}</a> : f.n}
                  </span>
                  <span className="st ok">Conforme</span>
                </div>
              ))}
            </div>
          )}
          <label className="field" htmlFor={`${r.id}-note`}>
            Nouveau point de suivi
            <textarea id={`${r.id}-note`} value={note} maxLength={255} placeholder="Avancement constaté, action réalisée, blocage" onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="clo-act" style={{ justifyContent: "space-between" }}>
            <label className="upl sm">
              + Justificatif
              <input
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={async (e) => {
                  for (const f of [...(e.target.files || [])]) {
                    addRecoFile(i.code, r.id, { name: f.name, size: sizeOf(f), contentBase64: await fileToBase64(f) });
                  }
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={!note.trim()}
              onClick={() => {
                addRecoSuivi(i.code, r.id, note.trim());
                setNote("");
              }}
            >
              Enregistrer le point de suivi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AddRecoForm({ i }: { i: Initiative }) {
  const { addReco } = useStore();
  const [openForm, setOpenForm] = useState(false);
  const [txt, setTxt] = useState("");
  const [resp, setResp] = useState("");
  const [ech, setEch] = useState("");
  const [obj, setObj] = useState("");

  if (!openForm)
    return (
      <div className="note-btns">
        <button type="button" className="btn-ghost sm" onClick={() => setOpenForm(true)}>
          + Recommandation
        </button>
      </div>
    );

  return (
    <div className="recos-add">
      <label className="field">
        Nouvelle recommandation
        <textarea value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={255} placeholder="Action recommandée" />
      </label>
      <label className="field">
        Objectif visé
        <input value={obj} onChange={(e) => setObj(e.target.value)} maxLength={200} placeholder="Résultat attendu, mesurable" />
      </label>
      <div className="rec-grid">
        <label className="field">
          Responsable de mise en œuvre
          <select value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Choisir un responsable…</option>
            {USERS.map((u) => <option key={u.id} value={u.nom}>{u.nom} · {deptName(u.dept)}</option>)}
          </select>
        </label>
        <label className="field">
          Échéance
          <input type="date" value={ech} onChange={(e) => setEch(e.target.value)} />
        </label>
      </div>
      <div className="clo-act">
        <button type="button" className="btn-ghost" onClick={() => setOpenForm(false)}>
          Annuler
        </button>
        <button
          type="button"
          className="btn"
          disabled={!txt.trim()}
          onClick={() => {
            addReco(i.code, { txt: txt.trim(), resp: resp.trim(), ech, obj: obj.trim() });
            setTxt("");
            setResp("");
            setEch("");
            setObj("");
            setOpenForm(false);
          }}
        >
          Enregistrer la recommandation
        </button>
      </div>
    </div>
  );
}

export default function RecosPage({ onOpenInitiative }: { onOpenInitiative: (code: string) => void }) {
  const { scopedInnos: innos } = useStore();
  const [filters, setFilters] = useState<InitiativeFilters>({ ...EMPTY_INITIATIVE_FILTERS });
  const [filter, setFilter] = useState<Filter>("toutes");

  const scoped = useMemo(() => filterInitiatives(innos.filter(isReco), filters), [innos, filters]);

  const all = useMemo(() => {
    const out: { i: Initiative; r: Recommandation }[] = [];
    scoped.forEach((i) => normRecos(i).forEach((r) => out.push({ i, r })));
    return out;
  }, [scoped]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { toutes: all.length, retard: 0, a_lancer: 0, en_cours: 0, realisee: 0, abandonnee: 0 };
    all.forEach(({ r }) => {
      c[r.st as Filter]++;
      if (recoLate(r)) c.retard++;
    });
    return c;
  }, [all]);

  const taux = avgTaux(all.map((x) => x.r));

  const keep = (r: Recommandation) => filter === "toutes" || (filter === "retard" ? recoLate(r) : r.st === filter);
  const groups = useMemo(
    () => scoped.map((i) => ({ i, items: normRecos(i).filter(keep) })).filter((g) => g.items.length),
    [scoped, filter]
  );

  const FLIST: [Filter, string][] = [
    ["toutes", "Toutes"],
    ["retard", "En retard"],
    ["a_lancer", "À lancer"],
    ["en_cours", "En cours"],
    ["realisee", "Mises en œuvre"],
    ["abandonnee", "Abandonnées"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Suivi de mise en œuvre</span>
          <h1>Recommandations (études, veilles, etc.)</h1>
          <p className="lead">
            Chaque recommandation a un responsable, une échéance et un statut. L'application relance le responsable
            avant l'échéance et alerte le responsable métier en cas de retard.
          </p>
        </div>
      </div>

      <InitiativeFilterBar items={innos.filter(isReco)} filters={filters} setFilters={setFilters} flags={{ type: false, phase: false, charte: false }} />

      <div className="summary s5">
        <div className="sum">
          <span className="v">{all.length}</span>
          <span className="k">Recommandations</span>
        </div>
        <div className="sum">
          <span className="v">{counts.en_cours}</span>
          <span className="k">En cours</span>
        </div>
        <div className="sum ok">
          <span className="v">{counts.realisee}</span>
          <span className="k">Mises en œuvre</span>
        </div>
        <div className="sum late">
          <span className="v">{counts.retard}</span>
          <span className="k">En retard</span>
        </div>
        <div className="sum">
          <span className="v">{taux == null ? "—" : taux + " %"}</span>
          <span className="k">Taux moyen de réalisation</span>
        </div>
      </div>

      <div className="rfilters" role="group" aria-label="Filtrer les recommandations">
        {FLIST.filter(([k]) => k === "toutes" || counts[k]).map(([k, l]) => (
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
              <b>Aucune recommandation</b>
              {all.length ? "Aucune recommandation ne correspond à ce filtre." : "Les recommandations saisies sur les études et les veilles apparaîtront ici."}
            </div>
          </div>
        )}
        {groups.map(({ i, items }) => (
          <div className="rgroup" key={i.code}>
            <div className="rgroup-h">
              <h2>
                <button type="button" className="linkish" style={{ fontSize: 15, fontWeight: 700 }} onClick={() => onOpenInitiative(i.code)}>
                  {i.code} · {i.titre}
                </button>
              </h2>
              <span className="sub">
                {typeLbl(i)} · responsable métier : {suivi(i)}
                {avgTaux(normRecos(i)) != null ? ` · taux moyen de réalisation ${avgTaux(normRecos(i))} %` : ""}
              </span>
            </div>
            <div className="recs">
              {items.map((r) => (
                <RecoItem key={r.id} i={i} r={r} />
              ))}
            </div>
            <AddRecoForm i={i} />
          </div>
        ))}
      </div>
    </div>
  );
}
