import { useEffect, useRef, useState, type DragEvent } from "react";
import { useStore } from "../state/store";
import { useCloseStep } from "../lib/useCloseStep";
import { lastClosedIdx, planEnd, planRole, planShiftDays, type ViewRow, viewList } from "../lib/planning";
import { TODAY, fmt, fmtY, iso } from "../lib/dates";
import {
  budAlert,
  budPct,
  deptName,
  fmtM,
  fmtXAF,
  isProj,
  isReco,
  normBens,
  normRecos,
  numv,
  phaseLbl,
  prog,
  suivi,
  typeLbl,
} from "../lib/domain";
import { PILIERS, PROGS, pilOf, progOf, refLbl } from "../data/reference";
import { validatorName } from "../lib/validation";
import { LBL } from "../data/templates";
import { BenItem, AddBenForm } from "../pages/BensPage";
import { RecoItem, AddRecoForm } from "../pages/RecosPage";
import BudgetValideEditor from "./BudgetValideEditor";
import { downloadPlan } from "../lib/xlsxExport";
import type { Initiative } from "../data/types";
import { fileToBase64, type UploadableFile } from "../lib/fileUploadFlow";

function sizeOf(file: File): string {
  const kb = file.size / 1024;
  return kb > 1024 ? (kb / 1024).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(kb)) + " Ko";
}

export default function StepsDrawer({ code, onEdit, onClose }: { code: string | null; onEdit: (code: string) => void; onClose: () => void }) {
  const { scopedInnos: innos, logMessage, toast, deleteInitiative, profile, me, vals } = useStore();
  const i = code ? innos.find((x) => x.code === code) : null;
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  function downloadPlanning(inno: Initiative) {
    downloadPlan(inno);
    logMessage(`${inno.code} · Planning détaillé téléchargé (Excel).`);
    toast(`Planning de ${inno.code} téléchargé · retards et avancées par étape`);
  }

  useEffect(() => {
    if (code) setTimeout(() => closeBtnRef.current?.focus(), 0);
    setDeleteArmed(false);
  }, [code]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && code) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [code, onClose]);

  if (!code || !i) return <div className="scrim" hidden />;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer s" role="dialog" aria-modal="true" aria-labelledby="s-title">
        <div className="d-head">
          <div>
            <span className="eyebrow">
              {i.code} · {typeLbl(i)} · {phaseLbl(i)}
            </span>
            <h2 id="s-title">{i.titre}</h2>
            <p className="sub">
              Porteur : {i.porteur}
              {i.dept ? ` (${deptName(i.dept)})` : ""} · Métier : {suivi(i)} · avancement {prog(i)} % ·{" "}
              {i.jalons.reduce((a, j) => a + j.f.length, 0)} document(s)
            </p>
            <button type="button" className="btn-ghost sm" style={{ marginTop: 8 }} onClick={() => downloadPlanning(i)}>
              ⤓ Télécharger le planning (Excel)
            </button>
            {(profile === "admin" || i.porteurId === me.id) && <button type="button" className="btn-ghost sm" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => onEdit(i.code)}>Modifier l’initiative</button>}
            {profile === "admin" && <button type="button" className="btn-ghost sm danger" style={{ marginTop: 8, marginLeft: 8 }} onClick={async () => {
              if (!deleteArmed) {
                setDeleteArmed(true);
                setTimeout(() => setDeleteArmed(false), 5000);
                return;
              }
              if (await deleteInitiative(i.code)) onClose();
            }}>
              {deleteArmed ? "Confirmer la suppression" : "Supprimer l’initiative"}
            </button>}
            {vals.some((v) => v.code === i.code && v.st === "attente") && <p className="hint err" style={{ margin: "8px 0 0" }}>Suppression indisponible : une validation est en attente.</p>}
          </div>
          <button className="x" aria-label="Fermer" ref={closeBtnRef} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="d-body">
          <FicheBlock i={i} />
          {isReco(i) ? <RecosBlock i={i} /> : <BensBlock i={i} />}
          <PlanBanner i={i} />
          <StepsList i={i} />
          <AddStepForm i={i} />
        </div>
      </aside>
    </>
  );
}

function FicheBlock({ i }: { i: Initiative }) {
  const pc = budPct(i);
  const al = budAlert(i);
  const charteJalon = i.jalons.find((j) => j.charte);
  return (
    <div className="fiche">
      <dl className="kv2">
        <dt>Pilier</dt>
        <dd>{refLbl(pilOf(i.pil))}</dd>
        <dt>Programme</dt>
        <dd>{refLbl(progOf(i.prog))}</dd>
        <dt>Origine du dossier</dt>
        <dd>{i.origineDossier === "Autre" ? i.origineDossierAutre || "Autre" : i.origineDossier || "Non renseignée"}</dd>
        <dt>Axe BSC</dt>
        <dd>{i.axeBsc || "Non renseigné"}</dd>
        {isProj(i) && (
          <>
            <dt>Charte de projet</dt>
            <dd className="n">
              {i.charteAt ? (
                <span className="chip c-valide">Validée le {fmtY(i.charteAt)}</span>
              ) : charteJalon ? (
                <>
                  <span className="chip c-a_venir">Non validée</span> <span className="n">étape « {charteJalon.t} » · {fmt(charteJalon.due)}</span>
                </>
              ) : (
                <span className="chip c-a_venir">Non validée</span>
              )}
            </dd>
          </>
        )}
      </dl>
      <RattachEditor i={i} />
      <dl className="kv2">
        {i.gnat && (
          <>
            <dt>Nature du livrable</dt>
            <dd>{i.gnat}</dd>
          </>
        )}
        <dt>Responsable métier</dt>
        <dd className={!i.metier ? "n" : undefined}>{i.metier || "Non désigné"}</dd>
        {i.benef && (
          <>
            <dt>Responsable bénéfice</dt>
            <dd>{i.benef}</dd>
          </>
        )}
        {i.resIT && (
          <>
            <dt>Responsable IT</dt>
            <dd>{i.resIT}</dd>
          </>
        )}
        {i.type === "veille" && (
          <>
            {i.vtype && (
              <>
                <dt>Type de veille</dt>
                <dd>{i.vtype}</dd>
              </>
            )}
            {i.deb && (
              <>
                <dt>Dates</dt>
                <dd>
                  du {fmtY(i.deb)} au {fmtY(i.vfin!)}
                </dd>
              </>
            )}
            {i.participants && (
              <>
                <dt>Participants</dt>
                <dd>{i.participants}</dd>
              </>
            )}
            {i.desc && (
              <>
                <dt>Description</dt>
                <dd>{i.desc}</dd>
              </>
            )}
          </>
        )}
      </dl>
      <SuspensionEditor i={i} />
      {numv(i.bv) != null && (
        <div className="bud">
          <div className="bud-grid">
            <div className="bud-v">
              <span className="lbl">Budget validé (XAF)</span>
              <b>
                <BudgetValideEditor i={i} />
              </b>
            </div>
            <div className="bud-v">
              <span className="lbl">Budget consommé (XAF)</span>
              <b>{fmtM(i.bc)}</b>
            </div>
          </div>
          <div>
            <span className={`minibar${(pc || 0) > 100 ? " over" : ""}`} style={{ width: 120 }}>
              <i style={{ width: `${Math.min(100, pc || 0)}%` }}></i>
            </span>{" "}
            <span className="mono">{pc == null ? "—" : `${pc} %`}</span>{" "}
            {al && <span className={`chip ${al[1]}`}>{al[0]}</span>}
          </div>
          <BudgetUpdateForm i={i} />
        </div>
      )}
    </div>
  );
}

function RattachEditor({ i }: { i: Initiative }) {
  const { requestRattach } = useStore();
  const [editing, setEditing] = useState(false);
  const [pil, setPil] = useState(i.pil || "");
  const [prog, setProg] = useState(i.prog || "");

  if (i.ratPend) {
    return (
      <p className="hint" style={{ margin: "-4px 0 0" }}>
        Changement de rattachement en attente du Chef de département : {refLbl(progOf(i.ratPend.prog))}.
      </p>
    );
  }

  if (!editing) {
    return (
      <div>
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setPil(i.pil || "");
            setProg(i.prog || "");
            setEditing(true);
          }}
        >
          Modifier le pilier ou le programme (soumis à validation)
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="bud-grid">
        <label className="field" htmlFor={`${i.code}-rp`}>
          Pilier stratégique
          <select id={`${i.code}-rp`} value={pil} onChange={(e) => setPil(e.target.value)}>
            <option value="">Choisir…</option>
            {PILIERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} – {p.lib}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor={`${i.code}-rg`}>
          Programme stratégique
          <select id={`${i.code}-rg`} value={prog} onChange={(e) => setProg(e.target.value)}>
            <option value="">Choisir…</option>
            {PROGS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} – {p.lib}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="clo-act">
        <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
          Annuler
        </button>
        <button
          type="button"
          className="btn"
          disabled={!pil || !prog}
          onClick={() => {
            if (pil === i.pil && prog === i.prog) {
              setEditing(false);
              return;
            }
            requestRattach(i, pil, prog);
            setEditing(false);
          }}
        >
          Soumettre au Chef de département
        </button>
      </div>
    </>
  );
}

function SuspensionEditor({ i }: { i: Initiative }) {
  const { requestSuspension } = useStore();
  const [editing, setEditing] = useState(false);
  const [motif, setMotif] = useState("");

  return (
    <div className="susp-b">
      {i.susp && (
        <p className="susp-note">
          <span className="chip h-susp">Suspendue</span> depuis le {fmtY(i.susp.at)} · {i.susp.motif}
        </p>
      )}
      {i.suspPend ? (
        <p className="hint" style={{ margin: 0 }}>
          {i.susp ? "Reprise" : "Suspension"} demandée, en attente du Directeur.
        </p>
      ) : editing ? (
        <>
          <label className="field" htmlFor={`${i.code}-sp`}>
            {i.susp ? "Motif de la reprise" : "Motif de la suspension"}
            <textarea
              id={`${i.code}-sp`}
              maxLength={255}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder={i.susp ? "Ex. Arbitrage obtenu, budget confirmé" : "Ex. En attente d'arbitrage budgétaire"}
            />
          </label>
          <div className="clo-act">
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn"
              disabled={!motif.trim()}
              onClick={() => {
                requestSuspension(i, motif.trim());
                setEditing(false);
                setMotif("");
              }}
            >
              Soumettre au Directeur
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="linkish" onClick={() => setEditing(true)}>
          {i.susp ? "Demander la reprise de l'initiative (soumis au Directeur)" : "Suspendre l'initiative (soumis au Directeur)"}
        </button>
      )}
    </div>
  );
}

function BudgetUpdateForm({ i }: { i: Initiative }) {
  const { profile, updateBudgetConsumed } = useStore();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState(i.bc || "");
  const [at, setAt] = useState(iso(TODAY));
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<UploadableFile | null>(null);
  const canEdit = profile !== "admin";

  if (!canEdit) return null;

  if (!open) {
    return (
      <div className="note-btns">
        <button type="button" className="btn-ghost sm" onClick={() => { setAmount(i.bc || ""); setAt(iso(TODAY)); setOpen(true); }}>
          Mettre à jour le consommé
        </button>
      </div>
    );
  }

  const valid = numv(amount) != null && at <= iso(TODAY);

  return (
    <div className="bud-grid" style={{ borderTop: "1px dashed var(--line)", paddingTop: 10, marginTop: 4 }}>
      <label className="field" htmlFor={`${i.code}-bc-amount`}>
        Nouveau montant cumulé (XAF)
        <input id={`${i.code}-bc-amount`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ex. 28 000 000" />
      </label>
      <label className="field" htmlFor={`${i.code}-bc-at`}>
        Date d'arrêté
        <input id={`${i.code}-bc-at`} type="date" max={iso(TODAY)} value={at} onChange={(e) => setAt(e.target.value)} />
      </label>
      <label className="field wide" htmlFor={`${i.code}-bc-comment`}>
        Commentaire (facultatif)
        <textarea id={`${i.code}-bc-comment`} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={255} />
      </label>
      <label className="upl sm" style={{ justifySelf: "start" }}>
        + Pièce justificative (facultatif)
        <input
          type="file"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setFile({ name: f.name, size: sizeOf(f), contentBase64: await fileToBase64(f) });
          }}
        />
      </label>
      {file && <span className="hint">{file.name}</span>}
      <div className="clo-act">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Annuler
        </button>
        <button
          type="button"
          className="btn"
          disabled={!valid || saving}
          onClick={async () => {
            setSaving(true);
            const saved = await updateBudgetConsumed(i.code, amount.trim(), at, comment.trim() || undefined, file || undefined);
            setSaving(false);
            if (!saved) return;
            setOpen(false);
            setComment("");
            setFile(null);
          }}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {!!(i.bcHist && i.bcHist.length) && (
        <div className="clo-txt wide" style={{ gridColumn: "1 / -1" }}>
          <span className="lbl">Historique des mises à jour</span>
          {i.bcHist.map((h, k) => (
            <p key={k}>
              <span className="nd">{fmt(h.at)}</span>
              {fmtXAF(h.v)}
              {h.comment ? ` — ${h.comment}` : ""}
              {h.file ? ` · ${h.file.n}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function BensBlock({ i }: { i: Initiative }) {
  const bens = normBens(i);
  return (
    <div className={`bens${bens.length ? "" : " ben-miss"}`}>
      <div className="clo-h">
        <b>Bénéfices attendus{bens.length ? ` (${bens.length})` : ""}</b>
        {!bens.length && <span className="chip h-risk">À définir</span>}
      </div>
      {bens.length ? (
        <div className="recs">
          {bens.map((b, k) => (
            <BenItem key={b.id || k} i={i} b={b} />
          ))}
        </div>
      ) : (
        <p className="hint">Aucun bénéfice défini. Précisez ce que l'initiative doit apporter.</p>
      )}
      <AddBenForm i={i} />
    </div>
  );
}

function RecosBlock({ i }: { i: Initiative }) {
  const recos = normRecos(i);
  return (
    <div className={`recos${recos.length ? "" : " reco-miss"}`}>
      <div className="clo-h">
        <b>
          Recommandations de {i.type === "veille" ? "la veille" : "l'étude"}
          {recos.length ? ` (${recos.length})` : ""}
        </b>
        {!recos.length && <span className="chip h-late">Obligatoires pour clôturer</span>}
      </div>
      {recos.length ? (
        <div className="recs">
          {recos.map((r) => (
            <RecoItem key={r.id} i={i} r={r} />
          ))}
        </div>
      ) : (
        <p className="hint">Aucune recommandation pour l'instant.</p>
      )}
      <AddRecoForm i={i} />
    </div>
  );
}

function PlanBanner({ i }: { i: Initiative }) {
  const { vals, scopedInnos: innos, cancelPlan, submitPlan } = useStore();
  if (!i.plan) return null;
  const req = i.plan.reqId ? vals.find((v) => v.id === i.plan!.reqId) : null;

  if (req) {
    return (
      <div className="plan wait">
        <b>Replanification en attente de validation</b>
        <span>
          Soumise le {fmt(req.at)} à {validatorName(req, innos)} : {i.plan.changes.length} modification(s), fin
          prévue {fmtY(i.plan.endBefore)} → {fmtY(planEnd(i))}. Les dates en vigueur restent celles d'avant jusqu'à la
          décision.
        </span>
      </div>
    );
  }

  const sh = planShiftDays(i);
  const role = planRole(i);
  return (
    <div className="plan">
      <b>Replanification en préparation</b>
      <ul>
        {i.plan.changes.map((c, k) => (
          <li key={k}>{c}</li>
        ))}
      </ul>
      <span>
        Fin prévue : {fmtY(i.plan.endBefore)} → <b>{fmtY(planEnd(i))}</b> ({sh > 0 ? "+" : ""}
        {sh} j). Sera soumise à : {role === "dir" ? "Directeur" : "Chef de département"}.
      </span>
      <div className="clo-act">
        <button type="button" className="btn-ghost" onClick={() => cancelPlan(i.code)}>
          Annuler les modifications
        </button>
        <button type="button" className="btn" onClick={() => submitPlan(i)}>
          Soumettre à validation
        </button>
      </div>
    </div>
  );
}

function StepsList({ i }: { i: Initiative }) {
  const { moveJalon } = useStore();
  const [sOpen, setSOpen] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropMark, setDropMark] = useState<{ id: string; before: boolean } | null>(null);
  const dropIdxRef = useRef<number | null>(null);
  const rows = viewList(i);
  const locked = !!(i.plan && i.plan.reqId);

  function endDrag() {
    setDragId(null);
    setDropMark(null);
    dropIdxRef.current = null;
  }

  function dragOverRow(e: DragEvent<HTMLDivElement>, targetId: string) {
    if (!dragId || targetId === dragId) return;
    const top = e.currentTarget.querySelector(".stp-top");
    const rect = top?.getBoundingClientRect();
    const before = rect ? e.clientY < rect.top + rect.height / 2 : true;
    const from = rows.findIndex((x) => x.id === dragId);
    let to = rows.findIndex((x) => x.id === targetId) + (before ? 0 : 1);
    if (from < to) to--;
    if (to <= lastClosedIdx(i, dragId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dropIdxRef.current = to;
    setDropMark((prev) => (prev?.id === targetId && prev.before === before ? prev : { id: targetId, before }));
  }

  function dropOnRow(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const id = dragId;
    const to = dropIdxRef.current;
    endDrag();
    if (id && to != null) moveJalon(i.code, id, to);
  }

  return (
    <div className="slist">
      {rows.map((row, k) => {
        const dropCls = dropMark?.id === row.id ? (dropMark.before ? " drop-before" : " drop-after") : "";
        const draggingCls = dragId === row.id ? " dragging" : "";
        if (row.proposed) {
          const canDrag = !locked;
          return (
            <div
              className={`stp proposed${dropCls}${draggingCls}`}
              key={row.id}
              onDragOver={(e) => dragOverRow(e, row.id)}
              onDrop={dropOnRow}
            >
              <div className="stp-top">
                <span
                  className={`grip${canDrag ? "" : " off"}`}
                  draggable={canDrag}
                  onDragStart={() => setDragId(row.id)}
                  onDragEnd={endDrag}
                  title={canDrag ? "Glisser pour déplacer ce jalon" : "Position dans le planning"}
                ></span>
                <div className="stp-row" style={{ cursor: "default" }}>
                  <span className="k">{String(k + 1).padStart(2, "0")}</span>
                  <span>
                    <b>
                      {row.t}
                      <span className="newtag">Proposé</span>
                    </b>
                    <span className="sub">
                      Échéance {fmt(row.due)} · {row.dur} j. ouvrés · pièce attendue : {row.req}
                    </span>
                  </span>
                  <span className="chip c-a_venir">{locked ? "En validation" : "Brouillon"}</span>
                  <span className="mv">
                    <button type="button" className="btn-ghost sm" disabled={locked || k === 0} onClick={() => moveJalon(i.code, row.id, k - 1)}>
                      ↑
                    </button>
                    <button type="button" className="btn-ghost sm" disabled={locked || k >= rows.length - 1} onClick={() => moveJalon(i.code, row.id, k + 1)}>
                      ↓
                    </button>
                  </span>
                </div>
              </div>
            </div>
          );
        }
        return (
          <StepRow
            key={row.id}
            i={i}
            row={row}
            idx={k}
            total={rows.length}
            locked={locked}
            open={sOpen.has(row.id)}
            onToggle={() =>
              setSOpen((prev) => {
                const next = new Set(prev);
                if (next.has(row.id)) next.delete(row.id);
                else next.add(row.id);
                return next;
              })
            }
            lastClosed={lastClosedIdx(i, row.id)}
            dropCls={dropCls}
            draggingCls={draggingCls}
            onGripDragStart={() => setDragId(row.id)}
            onGripDragEnd={endDrag}
            onRowDragOver={(e: DragEvent<HTMLDivElement>) => dragOverRow(e, row.id)}
            onRowDrop={dropOnRow}
          />
        );
      })}
    </div>
  );
}

function StepRow({
  i,
  row,
  idx,
  total,
  locked,
  open,
  onToggle,
  lastClosed,
  dropCls,
  draggingCls,
  onGripDragStart,
  onGripDragEnd,
  onRowDragOver,
  onRowDrop,
}: {
  i: Initiative;
  row: ViewRow;
  idx: number;
  total: number;
  locked: boolean;
  open: boolean;
  onToggle: () => void;
  lastClosed: number;
  dropCls: string;
  draggingCls: string;
  onGripDragStart: () => void;
  onGripDragEnd: () => void;
  onRowDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onRowDrop: (e: DragEvent<HTMLDivElement>) => void;
}) {
  const { moveJalon, removeJalon, addFiles, addNote, requestFileWithdrawal } = useStore();
  const j = i.jalons.find((x) => x.id === row.id)!;
  const [closeOpen, setCloseOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState<"com" | "dif" | null>(null);
  const [noteTxt, setNoteTxt] = useState("");
  const [fileBusy, setFileBusy] = useState<"upload" | string | null>(null);
  const [fileArmed, setFileArmed] = useState<string | null>(null);
  const { finDraft, setFinDraft, err, setErr, gap, saving, handleValidate } = useCloseStep(i, j, () => setCloseOpen(false));

  const mov = row.st !== "valide" && !locked;
  const ind: string[] = [`${row.f.length} doc.`];
  if (row.difs.length) ind.push(`${row.difs.length} diff.`);
  if (row.coms.length) ind.push(`${row.coms.length} com.`);

  async function handleFiles(list: FileList | null) {
    if (!list || !list.length) return;
    setFileBusy("upload");
    try {
      await addFiles(i.code, j.id, await Promise.all([...list].map(async (f) => ({ name: f.name, size: sizeOf(f), contentBase64: await fileToBase64(f) }))));
    } finally {
      setFileBusy(null);
    }
  }

  async function handleFileWithdrawal(file: typeof j.f[number]) {
    if (fileBusy || file.pendDel) return;
    if (fileArmed !== file.n) {
      setFileArmed(file.n);
      setTimeout(() => setFileArmed((current) => current === file.n ? null : current), 4000);
      return;
    }
    setFileBusy(file.n);
    try {
      if (await requestFileWithdrawal(i, j, file)) setFileArmed(null);
    } finally {
      setFileBusy(null);
    }
  }

  async function submitNote() {
    if (!noteOpen || !noteTxt.trim()) return;
    if (await addNote(i.code, j.id, noteOpen, noteTxt.trim())) {
      setNoteOpen(null);
      setNoteTxt("");
    }
  }

  return (
    <div className={`stp${open ? " open" : ""}${dropCls}${draggingCls}`} onDragOver={onRowDragOver} onDrop={onRowDrop}>
      <div className="stp-top">
        <span
          className={`grip${mov ? "" : " off"}`}
          draggable={mov}
          onDragStart={mov ? onGripDragStart : undefined}
          onDragEnd={mov ? onGripDragEnd : undefined}
          title={mov ? "Glisser pour déplacer ce jalon (ou utiliser les boutons ci-dessous)" : "Étape clôturée : position fixe"}
        ></span>
        <button type="button" className="stp-row" aria-expanded={open} onClick={onToggle}>
          <span className="k">{String(idx + 1).padStart(2, "0")}</span>
          <span>
            <b>{row.t}</b>
            <span className="sub">
              Échéance {fmt(row.due)}
              {row._old ? <span className="old">{fmt(row._old)}</span> : ""}
              {row.fin ? ` · fin réelle ${fmt(row.fin)}` : ""}
            </span>
            <span className="ind">{ind.join(" · ")}</span>
          </span>
          <span className={`chip c-${row.st}`}>{LBL[row.st]}</span>
          <span className="chev" aria-hidden="true">
            ›
          </span>
        </button>
      </div>
      {open && (
        <div className="stp-body">
          <p className="req">
            Pièce attendue : <b>{j.req}</b>
          </p>
          {mov && (
            <div className="mv">
              Position {idx + 1} sur {total}
              <button type="button" className="btn-ghost sm" disabled={idx - 1 <= lastClosed} onClick={() => moveJalon(i.code, j.id, idx - 1)}>
                ↑ Monter
              </button>
              <button type="button" className="btn-ghost sm" disabled={idx >= total - 1} onClick={() => moveJalon(i.code, j.id, idx + 1)}>
                ↓ Descendre
              </button>
              {total > 1 && (
                <button type="button" className="btn-ghost sm danger" onClick={() => removeJalon(i.code, j.id)}>
                  Retirer ce jalon
                </button>
              )}
            </div>
          )}
          {j.f.length > 0 && (
            <div className="files">
              {j.f.map((f, fk) => (
                <div className="file" key={fk}>
                  <span className="fname">
                    <span className="ext">{f.n.split(".").pop()}</span>
                    {f.url ? <a className="linkbtn" href={f.url} target="_blank" rel="noreferrer" download={f.n}>{f.n}</a> : f.n}
                  </span>
                  <span className="file-actions">
                    <span className={`st ${f.ok ? "ok" : "run"}`}>{f.ok ? "Conforme" : "Contrôle…"}</span>
                    {f.pendDel ? (
                      <span className="chip c-a_venir">Retrait en attente</span>
                    ) : (
                      <button type="button" className={`btn-ghost sm danger${fileArmed === f.n ? " armed" : ""}`} disabled={!!fileBusy} onClick={() => handleFileWithdrawal(f)}>
                        {fileBusy === f.n && <span className="spinner" aria-hidden="true" />}
                        {fileBusy === f.n ? "Suppression…" : fileArmed === f.n ? "Confirmer le retrait" : "Retirer"}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="notes-wrap">
            <div className="notes">
              {j.difs.length > 0 && (
                <div className="clo-txt dif">
                  <span className="lbl">Difficultés ({j.difs.length})</span>
                  {[...j.difs].sort((a, b) => b.at.localeCompare(a.at)).map((x, k) => (
                    <p key={k}>
                      <span className="nd">{fmt(x.at)}</span>
                      {x.txt}
                    </p>
                  ))}
                </div>
              )}
              {j.coms.length > 0 && (
                <div className="clo-txt">
                  <span className="lbl">Commentaires ({j.coms.length})</span>
                  {[...j.coms].sort((a, b) => b.at.localeCompare(a.at)).map((x, k) => (
                    <p key={k}>
                      <span className="nd">{fmt(x.at)}</span>
                      {x.txt}
                    </p>
                  ))}
                </div>
              )}
              {noteOpen && (
                <div className="nform">
                  <textarea
                    value={noteTxt}
                    onChange={(e) => setNoteTxt(e.target.value)}
                    maxLength={255}
                    placeholder={noteOpen === "com" ? "Commentaire" : "Difficulté rencontrée"}
                  />
                  <div className="clo-act">
                    <button type="button" className="btn-ghost sm" onClick={() => setNoteOpen(null)}>
                      Annuler
                    </button>
                    <button type="button" className={`btn sm${noteOpen === "dif" ? " red" : ""}`} onClick={submitNote}>
                      Enregistrer
                    </button>
                  </div>
                </div>
              )}
              <div className="note-btns">
                {noteOpen !== "com" && (
                  <button type="button" className="btn-ghost sm" onClick={() => setNoteOpen("com")}>
                    + Commentaire
                  </button>
                )}
                {noteOpen !== "dif" && (
                  <button type="button" className="btn-ghost sm" onClick={() => setNoteOpen("dif")}>
                    + Difficulté
                  </button>
                )}
              </div>
            </div>
          </div>
          {row.st === "valide" ? (
            <div className="clo">
              <div className="clo-row">
                <span className="l">Fin réelle</span>
                <b>{fmtY(j.fin!)}</b>
                <span className="l">· prévue le {fmtY(row.due)}</span>
                {gap}
              </div>
            </div>
          ) : closeOpen ? (
            <div className="clo">
              <div className="clo-grid">
                <label className="field" htmlFor={`${j.id}-fin`}>
                  Date de fin réelle
                  <input
                    type="date"
                    id={`${j.id}-fin`}
                    max={iso(TODAY)}
                    value={finDraft}
                    onChange={(e) => {
                      setFinDraft(e.target.value);
                      setErr("");
                    }}
                  />
                </label>
                <div className="gap">{gap}</div>
              </div>
              {err && <p className="hint err">{err}</p>}
              <div className="clo-act">
                <button type="button" className="btn-ghost" onClick={() => setCloseOpen(false)}>
                  Annuler
                </button>
                <button type="button" className="btn red" disabled={saving} onClick={handleValidate}>
                  {saving ? "Enregistrement SharePoint…" : "Confirmer la clôture"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="stp-a">
            <label className={`upl sm${fileBusy === "upload" ? " is-loading" : ""}`}>
              {fileBusy === "upload" && <span className="spinner" aria-hidden="true" />}
              {fileBusy === "upload" ? "Chargement du document…" : "+ Importer un document"}
              <input
                type="file"
                multiple
                style={{ display: "none" }}
                disabled={!!fileBusy}
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {row.st === "valide" ? (
              <small>
                {j.f.length} document{j.f.length > 1 ? "s" : ""}
              </small>
            ) : !closeOpen ? (
              <button type="button" className="btn" onClick={() => setCloseOpen(true)}>
                Clôturer l'étape
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function AddStepForm({ i }: { i: Initiative }) {
  const { addDraftJalon } = useStore();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState("");
  const [dur, setDur] = useState("10");
  const [req, setReq] = useState("");
  const locked = !!(i.plan && i.plan.reqId);

  if (locked) return null;

  if (!open) {
    return (
      <div className="addj">
        <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
          + Ajouter un jalon
        </button>
      </div>
    );
  }

  return (
    <div className="addj">
      <div className="addj-form">
        <b>Nouveau jalon</b>
        <label className="field" htmlFor="s-add-t">
          Intitulé
          <input id="s-add-t" value={t} onChange={(e) => setT(e.target.value)} maxLength={120} placeholder="Ex. Validation par le Comité de direction" />
        </label>
        <div className="addj-grid">
          <label className="field" htmlFor="s-add-dur">
            Durée (j. ouvrés)
            <input id="s-add-dur" type="number" min={1} max={250} value={dur} onChange={(e) => setDur(e.target.value)} />
          </label>
          <label className="field" htmlFor="s-add-req">
            Pièce attendue
            <input id="s-add-req" value={req} onChange={(e) => setReq(e.target.value)} maxLength={120} placeholder="Ex. Compte rendu du Comité" />
          </label>
        </div>
        <p className="hint">Le jalon est proposé en fin de liste. Positionnez-le, puis soumettez la replanification.</p>
        <div className="clo-act">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <button
            type="button"
            className="btn red"
            disabled={!t.trim()}
            onClick={() => {
              addDraftJalon(i.code, t.trim(), Math.max(1, Math.min(250, parseInt(dur, 10) || 1)), req.trim());
              setT("");
              setDur("10");
              setReq("");
              setOpen(false);
            }}
          >
            Ajouter le jalon
          </button>
        </div>
      </div>
    </div>
  );
}
