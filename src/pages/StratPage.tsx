import { useState } from "react";
import { useStore } from "../state/store";
import { PILIERS, PROGS, ROLES, USERS, responsableOf, nextPilierCode, nextProgCode, nextRefId } from "../data/reference";
import { charteOK, fmtM, isProj, numv, valeurProduite } from "../lib/domain";
import type { Pilier, Programme } from "../data/types";
import { deleteStrategicReference, persistStrategicReference, sharePointServiceHealth } from "../lib/sharepointSync";

type Kind = "pil" | "prog";
interface EditState {
  k: Kind;
  id: string;
}

export default function StratPage() {
  const { scopedInnos: innos, profile, bump, logMessage, toast, sharePointReady } = useStore();
  const [rEdit, setREdit] = useState<EditState | null>(null);
  const [rDel, setRDel] = useState<EditState | null>(null);
  const [drawerKind, setDrawerKind] = useState<Kind | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLib, setEditLib] = useState("");
  const [editResponsable, setEditResponsable] = useState("");
  const [addCode, setAddCode] = useState<Record<Kind, string>>(() => ({ pil: nextPilierCode(), prog: nextProgCode() }));
  const [addLib, setAddLib] = useState<Record<Kind, string>>({ pil: "", prog: "" });
  const [addResponsable, setAddResponsable] = useState<Record<Kind, string>>({ pil: "", prog: "" });
  const [section, setSection] = useState<Kind>("pil");

  const canRef = profile === "chef" || profile === "dir" || profile === "admin";

  function list(k: Kind): (Pilier | Programme)[] {
    return k === "pil" ? PILIERS : PROGS;
  }
  function field(k: Kind): "pil" | "prog" {
    return k;
  }
  function startEdit(k: Kind, p: Pilier | Programme) {
    setREdit({ k, id: p.id });
    setRDel(null);
    setDrawerKind(k);
    setEditCode(p.code);
    setEditLib(p.lib);
    setEditResponsable(p.responsableId || "");
  }
  function cancel() {
    setREdit(null);
    setRDel(null);
    setDrawerKind(null);
  }
  function startAdd(k: Kind) {
    setREdit(null);
    setRDel(null);
    setDrawerKind(k);
    setAddCode({ ...addCode, [k]: k === "pil" ? nextPilierCode() : nextProgCode() });
    setAddLib({ ...addLib, [k]: "" });
    setAddResponsable({ ...addResponsable, [k]: "" });
  }
  async function save(k: Kind) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement");
    const L = list(k);
    const p = L.find((x) => x.id === rEdit!.id)!;
    const code = editCode.trim();
    const lib = editLib.trim();
    const responsableId = editResponsable.trim();
    if (!code || !lib || !responsableId || !responsableOf(responsableId)) return toast("Renseignez le code, le libellé et un responsable existant", "error");
    if (L.some((x) => x !== p && x.code.toLowerCase() === code.toLowerCase())) return toast("Ce code est déjà utilisé", "error");
    const N = k === "pil" ? "Pilier" : "Programme";
    const next = { ...p, code, lib, responsableId };
    try {
      await persistStrategicReference(k, next);
    } catch (error) {
      console.error("Référentiel stratégique non persisté dans SharePoint", error);
      toast(`Enregistrement impossible : ${sharePointServiceHealth(error)}`, "error");
      return;
    }
    if (code !== p.code || lib !== p.lib) logMessage(`Référentiel · ${N} « ${p.code} – ${p.lib} » renommé en « ${code} – ${lib} » par ${ROLES[profile]}.`);
    p.code = code;
    p.lib = lib;
    p.responsableId = responsableId;
    cancel();
    bump();
    toast(`${N} modifié et confirmé dans SharePoint`);
  }
  async function confirmDelete(k: Kind, id: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement");
    const L = list(k);
    const p = L.find((x) => x.id === id)!;
    if (innos.some((i) => i[field(k)] === id)) return toast("Cet élément est encore utilisé par une ou plusieurs initiatives", "error");
    const N = k === "pil" ? "Pilier" : "Programme";
    try {
      await deleteStrategicReference(k, id);
    } catch (error) {
      console.error("Référentiel stratégique non supprimé dans SharePoint", error);
      toast(`Suppression impossible : ${sharePointServiceHealth(error)}`, "error");
      return;
    }
    L.splice(L.indexOf(p), 1);
    logMessage(`Référentiel · ${N} « ${p.code} – ${p.lib} » supprimé par ${ROLES[profile]}.`);
    cancel();
    bump();
    toast(`${N} supprimé et confirmé dans SharePoint`);
  }
  async function add(k: Kind) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement");
    const L = list(k);
    const code = addCode[k].trim();
    const lib = addLib[k].trim();
    const responsableId = addResponsable[k].trim();
    if (!lib || !code || !responsableId || !responsableOf(responsableId)) return toast("Renseignez le code, le libellé et un responsable existant", "error");
    if (L.some((x) => x.code.toLowerCase() === code.toLowerCase())) return toast("Ce code est déjà utilisé", "error");
    const N = k === "pil" ? "Pilier" : "Programme";
    const reference = { id: nextRefId(k === "pil" ? "PL" : "PG"), code, lib, responsableId };
    try {
      await persistStrategicReference(k, reference);
    } catch (error) {
      console.error("Référentiel stratégique non créé dans SharePoint", error);
      toast(`Création impossible : ${sharePointServiceHealth(error)}`, "error");
      return;
    }
    L.push(reference);
    logMessage(`Référentiel · ${N} « ${code} – ${lib} » créé par ${ROLES[profile]}.`);
    setAddLib({ ...addLib, [k]: "" });
    setAddResponsable({ ...addResponsable, [k]: "" });
    setAddCode({ ...addCode, [k]: k === "pil" ? nextPilierCode() : nextProgCode() });
    cancel();
    bump();
    toast(`${N} créé et confirmé dans SharePoint`);
  }

  function renderTable(k: Kind, title: string, nounLabel: string) {
    const L = list(k);
    return (
      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div><h2>{title}</h2><p className="sub">Initiatives, chartes validées, budgets et valeur produite</p></div>
          {canRef && <button type="button" className="btn" onClick={() => startAdd(k)}>+ Ajouter</button>}
        </div>
        <div className="tbl-wrap">
          <table className="vt rt">
            <thead>
              <tr>
                <th>{nounLabel}</th>
                <th>Responsable</th>
                <th>Initiatives</th>
                <th>Charte validée</th>
                <th>Budget validé</th>
                <th>Consommé</th>
                <th>Valeur produite</th>
                {canRef && <th></th>}
              </tr>
            </thead>
            <tbody>
              {L.map((p) => {
                const L2 = innos.filter((i) => i[field(k)] === p.id);
                const pj = L2.filter(isProj);
                const bv = L2.reduce((a, i) => a + (numv(i.bv) || 0), 0);
                const bc = L2.reduce((a, i) => a + (numv(i.bc) || 0), 0);
                const val = L2.reduce((a, i) => a + (valeurProduite(i) || 0), 0);
                const deleting = rDel && rDel.k === k && rDel.id === p.id;
                return (
                  <tr key={p.id}>
                    <td>
                      <><b>{p.code}</b> – {p.lib}</>
                    </td>
                    <td>
                      {responsableOf(p.responsableId)?.nom || <span className="hint">Non défini</span>}
                    </td>
                    <td>{L2.length ? `${L2.length} initiative${L2.length > 1 ? "s" : ""}` : <span className="hint">Aucune</span>}</td>
                    <td className="mono">{pj.length ? `${pj.filter(charteOK).length} / ${pj.length} projet${pj.length > 1 ? "s" : ""}` : "—"}</td>
                    <td className="mono">{bv ? fmtM(bv) + " XAF" : "—"}</td>
                    <td className="mono">{bc ? fmtM(bc) + " XAF" : "—"}</td>
                    <td className="mono">{val ? fmtM(val) + " XAF" : "—"}</td>
                    {canRef && (
                      <td>
                        {deleting ? (
                          <div className="vreq-a">
                            <button type="button" className="btn red sm" onClick={() => confirmDelete(k, p.id)}>
                              Confirmer la suppression
                            </button>
                            <button type="button" className="btn-ghost sm" onClick={cancel}>
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <div className="vreq-a">
                            <button type="button" className="btn-ghost sm" onClick={() => startEdit(k, p)}>
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="btn-ghost sm"
                              disabled={L2.length > 0}
                              title={L2.length ? `Utilisé par ${L2.length} initiative(s) : réaffectez-les avant de supprimer` : undefined}
                              onClick={() => {
                                setRDel({ k, id: p.id });
                                setREdit(null);
                                setDrawerKind(k);
                              }}
                            >
                              Supprimer
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {L.length === 0 && (
                <tr>
                    <td colSpan={canRef ? 8 : 7} className="hint">
                    Aucun élément défini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Référentiel stratégique</span>
          <h1>Piliers et programmes</h1>
          <p className="lead">
            Chaque initiative est rattachée à un pilier et à un programme stratégiques. Cette vue montre ce que
            chaque axe mobilise et produit.
          </p>
        </div>
        <span className="auto-chip">
          <i></i>Connecté : {ROLES[profile]}
        </span>
      </div>
      <p className="hint">
        {canRef
          ? "Votre profil peut créer, modifier ou supprimer un pilier ou un programme. Un élément encore utilisé par des initiatives ne peut pas être supprimé : réaffectez-les d'abord."
          : "Lecture seule pour votre profil : seuls le Chef de département, le Directeur et l'Administrateur fonctionnel peuvent modifier ce référentiel."}
      </p>
      <nav className="subnav" aria-label="Référentiel stratégique">
        <button type="button" className={section === "pil" ? "active" : ""} onClick={() => setSection("pil")}>
          Piliers
        </button>
        <button type="button" className={section === "prog" ? "active" : ""} onClick={() => setSection("prog")}>
          Programmes
        </button>
      </nav>
      {section === "pil" && renderTable("pil", "Piliers stratégiques", "Pilier")}
      {section === "prog" && renderTable("prog", "Programmes stratégiques", "Programme")}
      {drawerKind && canRef && (
        <>
          <div className="scrim" onClick={cancel} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="ref-drawer-title">
            <div className="d-head">
              <div><span className="eyebrow">Référentiel stratégique</span><h2 id="ref-drawer-title">{rDel ? "Supprimer" : rEdit ? "Modifier" : "Ajouter"} {drawerKind === "pil" ? "un pilier" : "un programme"}</h2></div>
              <button className="x" aria-label="Fermer" onClick={cancel}>×</button>
            </div>
            {rDel ? (
              <div className="d-body"><p>Confirmez la suppression de cet élément. Cette action est impossible si des initiatives y sont encore rattachées.</p><p className="hint">Les données SharePoint seront mises à jour après confirmation.</p></div>
            ) : (
              <div className="d-body">
                <label className="field">Code<input value={rEdit ? editCode : addCode[drawerKind]} onChange={(e) => rEdit ? setEditCode(e.target.value) : setAddCode({ ...addCode, [drawerKind]: e.target.value })} maxLength={20} /></label>
                <label className="field">Libellé<input value={rEdit ? editLib : addLib[drawerKind]} onChange={(e) => rEdit ? setEditLib(e.target.value) : setAddLib({ ...addLib, [drawerKind]: e.target.value })} maxLength={120} placeholder="Libellé du référentiel" /></label>
                <label className="field">Responsable SharePoint<select value={rEdit ? editResponsable : addResponsable[drawerKind]} onChange={(e) => rEdit ? setEditResponsable(e.target.value) : setAddResponsable({ ...addResponsable, [drawerKind]: e.target.value })}>
                  <option value="">Choisir un utilisateur…</option>{USERS.map((u) => <option key={u.id} value={u.id}>{u.nom} · {u.email || "sans e-mail"}</option>)}
                </select></label>
                <p className="hint">Le responsable doit exister dans la liste SharePoint <b>02_Utilisateurs</b>. Son adresse e-mail sera utilisée pour la notification.</p>
              </div>
            )}
            <div className="d-foot"><div className="btns"><button type="button" className="btn-ghost" onClick={cancel}>Annuler</button>{rDel ? <button type="button" className="btn red" onClick={() => confirmDelete(rDel.k, rDel.id)}>Confirmer la suppression</button> : <button type="button" className="btn" disabled={!(rEdit ? editCode && editLib && editResponsable : addCode[drawerKind] && addLib[drawerKind] && addResponsable[drawerKind])} onClick={() => rEdit ? save(rEdit.k) : add(drawerKind)}>Enregistrer</button>}</div></div>
          </aside>
        </>
      )}
    </div>
  );
}
