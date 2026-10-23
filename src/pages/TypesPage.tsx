import { useState } from "react";
import { useStore } from "../state/store";
import { TEMPLATES, BUILT_IN_KEYS, TYPES, nextCustomTypeKey, tDur, durTxt } from "../data/templates";
import { typeKey } from "../lib/domain";
import { deleteInitiativeType, persistInitiativeType, sharePointServiceHealth } from "../lib/sharepointSync";

interface StepDraft {
  t: string;
  dur: number | string;
  req: string;
}
interface TypeDraft {
  key: string | null;
  label: string;
  desc: string;
  reco: boolean;
  steps: StepDraft[];
  err: string;
}

const blankType = (): TypeDraft => ({
  key: null,
  label: "",
  desc: "",
  reco: false,
  steps: [
    { t: "", dur: 10, req: "" },
    { t: "", dur: 10, req: "" },
  ],
  err: "",
});

export default function TypesPage() {
  const { innos, bump, logMessage, toast, sharePointReady } = useStore();
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [tDel, setTDel] = useState<string | null>(null);

  const used = (k: string) => innos.filter((i) => typeKey(i) === k).length;
  const customEntries = Object.entries(TEMPLATES).filter(([, t]) => t.custom);

  function startNew() {
    setDraft(blankType());
  }
  function startFrom(k: string) {
    const t = TEMPLATES[k];
    setDraft({ key: null, label: "", desc: "", reco: k === "etude" || k === "veille", steps: t.steps.map((s) => ({ t: s.t, dur: s.dur, req: s.req })), err: "" });
    toast(`Étapes reprises du modèle « ${k === "projet_it" ? "Projet IT" : t.label} » : renommez et ajustez`);
  }
  function startEdit(k: string) {
    const t = TEMPLATES[k];
    setDraft({ key: k, label: t.label, desc: t.desc || "", reco: !!t.reco, steps: t.steps.map((s) => ({ t: s.t, dur: s.dur, req: s.req })), err: "" });
  }
  async function toggleActive(k: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement");
    const t = TEMPLATES[k];
    const next = { ...t, active: !t.active };
    try {
      await persistInitiativeType(k, next);
    } catch (error) {
      console.error("Type d'initiative non persisté dans SharePoint", error);
      toast(`Modification impossible : ${sharePointServiceHealth(error)}`, "error");
      return;
    }
    TEMPLATES[k] = next;
    logMessage(`Paramétrage · Type d'initiative « ${t.label} » ${next.active ? "réactivé" : "désactivé"}.`);
    bump();
    toast(next.active ? "Type réactivé : de nouveau proposé à la création" : "Type désactivé : n'est plus proposé à la création");
  }
  async function confirmDelete(k: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement");
    const t = TEMPLATES[k];
    if (innos.some((i) => i.type === k)) {
      toast("Type utilisé : désactivez-le plutôt");
      return;
    }
    try {
      await deleteInitiativeType(k);
    } catch (error) {
      console.error("Type d'initiative non supprimé dans SharePoint", error);
      toast(`Suppression impossible : ${sharePointServiceHealth(error)}`, "error");
      return;
    }
    delete TEMPLATES[k];
    setTDel(null);
    logMessage(`Paramétrage · Type d'initiative « ${t.label} » supprimé.`);
    bump();
    toast("Type supprimé");
  }

  function addStep() {
    if (!draft) return;
    setDraft({ ...draft, steps: [...draft.steps, { t: "", dur: 10, req: "" }] });
  }
  function moveStep(k: number, dir: -1 | 1) {
    if (!draft) return;
    const steps = [...draft.steps];
    const j = k + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[k], steps[j]] = [steps[j], steps[k]];
    setDraft({ ...draft, steps });
  }
  function removeStep(k: number) {
    if (!draft || draft.steps.length <= 2) return;
    const steps = [...draft.steps];
    steps.splice(k, 1);
    setDraft({ ...draft, steps });
  }
  function updateStep(k: number, field: keyof StepDraft, value: string) {
    if (!draft) return;
    const steps = [...draft.steps];
    steps[k] = { ...steps[k], [field]: field === "dur" ? value : value };
    setDraft({ ...draft, steps, err: "" });
  }

  async function save() {
    if (!draft) return;
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement");
    const label = draft.label.trim();
    if (!label) return setDraft({ ...draft, err: "Donnez un nom au type." });
    const all = [...TYPES.map((x) => x[1]), ...Object.entries(TEMPLATES).filter(([k]) => k !== draft.key).map(([, t]) => t.label)];
    if (all.some((l) => l.toLowerCase() === label.toLowerCase())) return setDraft({ ...draft, err: "Un type porte déjà ce nom." });
    if (draft.steps.length < 2) return setDraft({ ...draft, err: "Un type doit compter au moins deux étapes." });
    const bad = draft.steps.findIndex((x) => !String(x.t).trim());
    if (bad >= 0) return setDraft({ ...draft, err: `Donnez un intitulé à l'étape ${bad + 1}.` });
    const bd = draft.steps.findIndex((x) => {
      const n = parseInt(String(x.dur), 10);
      return !(n >= 1 && n <= 250);
    });
    if (bd >= 0) return setDraft({ ...draft, err: `La durée de l'étape ${bd + 1} doit être comprise entre 1 et 250 jours ouvrés.` });

    const steps = draft.steps.map((x) => ({ t: String(x.t).trim(), dur: parseInt(String(x.dur), 10), req: String(x.req).trim() || "Justificatif de l'étape" }));
    const key = draft.key || nextCustomTypeKey();
    const prev = TEMPLATES[key];
    const next = { label, desc: draft.desc.trim(), reco: draft.reco, custom: true, active: prev ? prev.active : true, steps };
    try {
      await persistInitiativeType(key, next);
    } catch (error) {
      console.error("Type d'initiative non persisté dans SharePoint", error);
      return setDraft({ ...draft, err: `Enregistrement impossible : ${sharePointServiceHealth(error)}` });
    }
    TEMPLATES[key] = next;
    logMessage(`Paramétrage · Type d'initiative « ${label} » ${draft.key ? "modifié" : "publié"} : ${steps.length} étapes, ${tDur(steps)} jours ouvrés, suivi par ${draft.reco ? "recommandations" : "bénéfices attendus"}.`);
    if (!draft.key) logMessage(`Paramétrage · « ${label} » ajouté au formulaire « Nouvelle initiative ».`);
    setDraft(null);
    bump();
    toast(draft.key ? "Type modifié · s'applique aux prochaines initiatives" : `Type « ${label} » publié · disponible dans Nouvelle initiative`);
  }

  const tot = draft ? tDur(draft.steps.map((s) => ({ dur: parseInt(String(s.dur), 10) || 0 }))) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Administration · réservé à l'administrateur fonctionnel</span>
          <h1>Types d'initiative</h1>
          <p className="lead">
            Concevez les étapes d'un nouveau type d'initiative. Une fois publié, il apparaît dans « Nouvelle
            initiative » et se suit comme un projet ou un produit.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Types disponibles</h2>
          <p className="sub">Les types intégrés servent de point de départ ; les types conçus ici peuvent être modifiés, désactivés ou supprimés s'ils ne sont pas utilisés</p>
        </div>
        <div className="tbl-wrap">
          <table className="vt tt">
            <thead>
              <tr>
                <th>Type</th>
                <th>Étapes</th>
                <th>Durée par défaut</th>
                <th>Suivi du résultat</th>
                <th>Initiatives</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {BUILT_IN_KEYS.map((k) => {
                const t = TEMPLATES[k];
                const label = k === "projet_it" ? "Projet IT" : t.label;
                return (
                  <tr key={k}>
                    <td>
                      <b>{label}</b>
                    </td>
                    <td className="mono">{t.steps.length}</td>
                    <td className="mono">{k === "veille" ? "dates de l'événement" : durTxt(tDur(t.steps))}</td>
                    <td>{k === "etude" || k === "veille" ? "Recommandations" : "Bénéfices attendus"}</td>
                    <td className="mono">{used(k)}</td>
                    <td>
                      <span className="chip c-a_venir">Intégré</span>
                    </td>
                    <td>
                      <button type="button" className="btn-ghost sm" onClick={() => startFrom(k)}>
                        Partir de ce modèle
                      </button>
                    </td>
                  </tr>
                );
              })}
              {customEntries.map(([k, t]) => {
                const n = used(k);
                return (
                  <tr key={k}>
                    <td>
                      <b>{t.label}</b>
                      {t.desc && <div className="hint" style={{ margin: "2px 0 0" }}>{t.desc}</div>}
                    </td>
                    <td className="mono">{t.steps.length}</td>
                    <td className="mono">{durTxt(tDur(t.steps))}</td>
                    <td>{t.reco ? "Recommandations" : "Bénéfices attendus"}</td>
                    <td className="mono">{n}</td>
                    <td>{t.active ? <span className="chip c-valide">Actif</span> : <span className="chip c-en_retard">Désactivé</span>}</td>
                    <td>
                      {tDel === k ? (
                        <div className="vreq-a">
                          <button type="button" className="btn red sm" onClick={() => confirmDelete(k)}>
                            Confirmer la suppression
                          </button>
                          <button type="button" className="btn-ghost sm" onClick={() => setTDel(null)}>
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <div className="vreq-a">
                          <button type="button" className="btn-ghost sm" onClick={() => startEdit(k)}>
                            Modifier
                          </button>
                          <button type="button" className="btn-ghost sm" onClick={() => toggleActive(k)}>
                            {t.active ? "Désactiver" : "Réactiver"}
                          </button>
                          <button type="button" className="btn-ghost sm" disabled={!!n} title={n ? `Utilisé par ${n} initiative(s) : désactivez-le plutôt` : undefined} onClick={() => setTDel(k)}>
                            Supprimer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        {!draft ? (
          <>
            <div className="pad">
              <h2>Concevoir un nouveau type</h2>
              <p className="sub">Exemples : projet réglementaire, partenariat, campagne commerciale, programme de formation</p>
            </div>
            <div className="pad" style={{ paddingTop: 0 }}>
              <button type="button" className="btn red" onClick={startNew}>
                + Nouveau type d'initiative
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
              <h2>{draft.key ? `Modifier le type « ${TEMPLATES[draft.key].label} »` : "Nouveau type d'initiative"}</h2>
              <p className="sub">{draft.key ? "Les modifications s'appliquent aux initiatives créées ensuite." : "Nommez le type, choisissez ce qui sera suivi à la fin, puis décrivez ses étapes dans l'ordre."}</p>
            </div>
            <div className="pad t-form">
              <div className="form-grid">
                <label className="field">
                  Nom du type
                  <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value, err: "" })} maxLength={40} placeholder="Ex. Projet réglementaire" />
                </label>
                <label className="field wide">
                  Description courte (affichée dans « Nouvelle initiative »)
                  <input value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} maxLength={160} placeholder="Ex. Mise en conformité imposée par un texte réglementaire" />
                </label>
              </div>
              <div className="terrain">
                <span className="lbl">Résultat suivi à la fin</span>
                <div className="seg" role="radiogroup" aria-label="Résultat suivi">
                  <label>
                    <input type="radio" name="td-reco" checked={!draft.reco} onChange={() => setDraft({ ...draft, reco: false })} />
                    <span>
                      Bénéfices attendus<small>Comme un projet ou un produit</small>
                    </span>
                  </label>
                  <label>
                    <input type="radio" name="td-reco" checked={draft.reco} onChange={() => setDraft({ ...draft, reco: true })} />
                    <span>
                      Recommandations<small>Comme une étude ou une veille</small>
                    </span>
                  </label>
                </div>
              </div>
              <div className="t-steps">
                <div className="t-row t-head">
                  <span>N°</span>
                  <span>Étape</span>
                  <span>Durée (j. ouvrés)</span>
                  <span>Justificatif attendu</span>
                  <span></span>
                </div>
                {draft.steps.map((s, k) => (
                  <div className="t-row" key={k}>
                    <span className="mono t-n">{String(k + 1).padStart(2, "0")}</span>
                    <input type="text" value={s.t} onChange={(e) => updateStep(k, "t", e.target.value)} maxLength={80} placeholder={`Ex. ${["Analyse d'impact réglementaire", "Plan de mise en conformité", "Mise en œuvre", "Contrôle et attestation"][k % 4]}`} aria-label={`Intitulé de l'étape ${k + 1}`} />
                    <input type="number" value={s.dur} onChange={(e) => updateStep(k, "dur", e.target.value)} min={1} max={250} aria-label={`Durée de l'étape ${k + 1}`} />
                    <input type="text" value={s.req} onChange={(e) => updateStep(k, "req", e.target.value)} maxLength={80} placeholder="Ex. Note d'analyse signée" aria-label={`Justificatif attendu de l'étape ${k + 1}`} />
                    <span className="t-act">
                      <button type="button" className="btn-ghost sm" disabled={k === 0} aria-label="Monter" onClick={() => moveStep(k, -1)}>
                        ↑
                      </button>
                      <button type="button" className="btn-ghost sm" disabled={k === draft.steps.length - 1} aria-label="Descendre" onClick={() => moveStep(k, 1)}>
                        ↓
                      </button>
                      <button type="button" className="btn-ghost sm" disabled={draft.steps.length <= 2} aria-label="Retirer l'étape" onClick={() => removeStep(k)}>
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
                <div>
                  <button type="button" className="btn-ghost" onClick={addStep}>
                    + Ajouter une étape
                  </button>
                </div>
              </div>
              <div className="t-prev">
                <span className="lbl">Aperçu</span>
                <span>
                  {draft.steps.length} étapes · {durTxt(tot)}
                </span>
                <div className="t-strip">
                  {draft.steps.map((s, k) => (
                    <i key={k} style={{ flex: Math.max(1, parseInt(String(s.dur), 10) || 1) }} title={s.t || "Étape " + (k + 1)}></i>
                  ))}
                </div>
              </div>
              <p className={`hint${draft.err ? " err" : ""}`}>{draft.err || "Chaque étape devient un jalon suivi et relancé automatiquement."}</p>
              <div className="vreq-a" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
                  Annuler
                </button>
                <button type="button" className="btn red" onClick={save}>
                  {draft.key ? "Enregistrer les modifications" : "Publier le type"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
