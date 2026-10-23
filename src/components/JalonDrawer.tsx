import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, findJalon } from "../state/store";
import { TODAY, d, days, fmt, fmtY, iso } from "../lib/dates";
import { needsDecision, prog, suivi } from "../lib/domain";
import { useCloseStep } from "../lib/useCloseStep";
import { LBL } from "../data/templates";
import { fileToBase64 } from "../lib/fileUploadFlow";

function sizeOf(file: File): string {
  const kb = file.size / 1024;
  return kb > 1024 ? (kb / 1024).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(kb)) + " Ko";
}

export default function JalonDrawer({ jalonId, onClose }: { jalonId: string | null; onClose: () => void }) {
  const { scopedInnos: innos, sendComplement, addNote, addFiles } = useStore();
  const found = jalonId ? findJalon(innos, jalonId) : null;

  const [asking, setAsking] = useState(false);
  const [motif, setMotif] = useState("");
  const [noteOpen, setNoteOpen] = useState<"com" | "dif" | null>(null);
  const [noteTxt, setNoteTxt] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const { finDraft, setFinDraft, err, setErr, gap, saving, handleValidate } = useCloseStep(found?.i ?? null, found?.j ?? null, onClose);

  useEffect(() => {
    if (jalonId) {
      setAsking(false);
      setMotif("");
      setNoteOpen(null);
      setNoteTxt("");
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [jalonId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && jalonId) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [jalonId, onClose]);

  const idx = useMemo(() => (found ? found.i.jalons.indexOf(found.j) : -1), [found]);

  if (!jalonId || !found) return <div className="scrim" hidden />;
  const { i, j } = found;
  const next = i.jalons[idx + 1];
  const after = Math.round((100 * (i.jalons.filter((x) => x.st === "valide").length + 1)) / i.jalons.length);
  const closed = j.st === "valide";
  const dec = needsDecision(j);

  async function handleFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const files = await Promise.all([...list].map(async (f) => ({ name: f.name, size: sizeOf(f), contentBase64: await fileToBase64(f) })));
    addFiles(i.code, j.id, files);
  }

  async function handleSend() {
    if (!motif.trim()) return;
    if (await sendComplement(i.code, j.id, motif.trim())) onClose();
  }

  async function submitNote() {
    if (!noteOpen || !noteTxt.trim()) return;
    if (await addNote(i.code, j.id, noteOpen, noteTxt.trim())) {
      setNoteOpen(null);
      setNoteTxt("");
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="d-title">
        <div className="d-head">
          <div>
            <span className="eyebrow">
              {i.code} · Jalon {idx + 1} sur {i.jalons.length}
            </span>
            <h2 id="d-title">{j.t}</h2>
            <p className="sub">{i.titre}</p>
          </div>
          <button className="x" aria-label="Fermer" ref={closeBtnRef} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="d-body">
          <div className="prep">
            <span className="lbl">Ce que l'application fait pour vous</span>
            <ul>
              <li>
                {closed ? (
                  <>Étape clôturée · avancement actuel {prog(i)} %</>
                ) : (
                  <>
                    Avancement : {prog(i)} % → <b>{after} %</b> après clôture
                  </>
                )}
              </li>
              <li>
                {next
                  ? `Prochain jalon planifié : ${next.t} (${fmt(next.due)}), relances programmées`
                  : "Dernier jalon : l'initiative passera en phase suivante"}
              </li>
              <li>Porteur et responsable métier ({suivi(i)}) notifiés automatiquement</li>
              <li>
                {j.st === "en_retard"
                  ? `Retard de ${days(d(j.due), TODAY)} jours · relances déjà envoyées`
                  : "Pièce contrôlée automatiquement au dépôt"}
              </li>
            </ul>
          </div>

          <dl className="kv">
            <dt>Échéance</dt>
            <dd>{fmtY(j.due)}</dd>
            <dt>Statut</dt>
            <dd>
              <span className={`chip c-${j.st}`}>{LBL[j.st]}</span>
            </dd>
            <dt>Porteur</dt>
            <dd>{i.porteur}</dd>
            <dt>Responsable métier</dt>
            <dd>{i.metier || "Non désigné"}</dd>
          </dl>

          <p className="req">
            Pièce attendue : <b>{j.req}</b>
          </p>

          <div
            className={`drop${dragOver ? " over" : ""}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <b>Glissez un document ici</b>
            <small>ou</small>
            <button type="button" className="btn-ghost" onClick={() => fileInputRef.current?.click()}>
              Choisir un fichier
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <div className="files">
            {j.f.map((f, k) => (
              <div className="file" key={k}>
                <span className="fname">
                  <span className="ext">{f.n.split(".").pop()}</span>
                  {f.url ? (
                    <a className="linkbtn" href={f.url} target="_blank" rel="noreferrer" download={f.n}>
                      {f.n}
                    </a>
                  ) : f.n}{" "}
                  <span className="mono" style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>
                    {f.s}
                  </span>
                </span>
                <span className={`st ${f.ok ? "ok" : "run"}`}>{f.ok ? "Contrôle conforme" : "Contrôle en cours…"}</span>
              </div>
            ))}
          </div>

          <div className="notes-wrap">
            <div className="notes">
              {j.difs.length > 0 && (
                <div className="clo-txt dif">
                  <span className="lbl">Difficultés rencontrées ({j.difs.length})</span>
                  {[...j.difs]
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .map((x, k) => (
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
                  {[...j.coms]
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .map((x, k) => (
                      <p key={k}>
                        <span className="nd">{fmt(x.at)}</span>
                        {x.txt}
                      </p>
                    ))}
                </div>
              )}
              {!j.coms.length && !j.difs.length && <p className="hint">Aucun commentaire ni difficulté pour l'instant.</p>}
              {noteOpen && (
                <div className="nform">
                  <label className="field" htmlFor="note-txt">
                    {noteOpen === "com" ? "Nouveau commentaire" : "Nouvelle difficulté"}
                    <textarea
                      id="note-txt"
                      maxLength={255}
                      value={noteTxt}
                      onChange={(e) => setNoteTxt(e.target.value)}
                      placeholder={
                        noteOpen === "com"
                          ? "Ce qui a été réalisé, décisions prises, points à retenir"
                          : "Obstacle, retard, dépendance, risque pour la suite"
                      }
                    />
                  </label>
                  <div className="clo-act">
                    <button type="button" className="btn-ghost" onClick={() => setNoteOpen(null)}>
                      Annuler
                    </button>
                    <button type="button" className={`btn${noteOpen === "dif" ? " red" : ""}`} onClick={submitNote}>
                      {noteOpen === "com" ? "Enregistrer le commentaire" : "Signaler la difficulté"}
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

          {closed ? (
            <div className="clo">
              <div className="clo-row">
                <span className="l">Fin réelle</span>
                <b>{fmtY(j.fin!)}</b>
                <span className="l">· prévue le {fmtY(j.due)}</span>
                {gap}
              </div>
            </div>
          ) : (
            <div className="clo">
              <div className="clo-h">
                <b>Clôture de l'étape</b>
                <span className="sub">Fin prévue le {fmtY(j.due)}</span>
              </div>
              <div className="clo-grid">
                <label className="field" htmlFor="dc-fin">
                  Date de fin réelle
                  <input
                    type="date"
                    id="dc-fin"
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
            </div>
          )}

          {err && <p className="hint err">{err}</p>}
          {!err && (
            <p className="hint">
              {j.f.some((f) => !f.ok)
                ? "Contrôle automatique de la pièce en cours…"
                : closed
                ? "Étape clôturée. Vous pouvez encore y ajouter un document complémentaire."
                : !j.f.length
                ? "Importez la pièce attendue pour pouvoir clôturer l'étape."
                : "Indiquez la date de fin réelle, puis clôturez. La suite se déclenche automatiquement."}
            </p>
          )}
        </div>
        {dec && !closed && (
          <div className="d-foot">
            {asking && (
              <label className="field" htmlFor="d-motif">
                Motif du complément demandé
                <textarea id="d-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ce qui manque ou doit être corrigé" />
              </label>
            )}
            <div className="btns">
              {!asking ? (
                <button type="button" className="btn-ghost" onClick={() => setAsking(true)}>
                  Demander un complément
                </button>
              ) : (
                <button type="button" className="btn-ghost" onClick={handleSend}>
                  Envoyer la demande
                </button>
              )}
              <button type="button" className="btn red" disabled={saving} onClick={handleValidate}>
                {saving ? "Enregistrement SharePoint…" : "Clôturer l'étape"}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
