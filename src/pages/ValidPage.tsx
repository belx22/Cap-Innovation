import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { fmt } from "../lib/dates";
import { CIRCUIT, ROLES, VRULES, isMine, validatorName } from "../lib/validation";
import type { ValidationRequest } from "../data/types";
import FilterCombobox from "../components/FilterCombobox";

function VReqCard({ req, actionable, innos }: { req: ValidationRequest; actionable: boolean; innos: ReturnType<typeof useStore>["innos"] }) {
  const { decideValidation } = useStore();
  const [rejecting, setRejecting] = useState(false);
  const [motif, setMotif] = useState("");
  const i = innos.find((x) => x.code === req.code);

  const statusChip =
    req.st === "attente" ? (
      <span className="chip c-a_venir">En attente : {validatorName(req, innos)}</span>
    ) : req.st === "approuvee" ? (
      <span className="chip c-ok">Approuvée</span>
    ) : (
      <span className="chip c-ko">Rejetée</span>
    );

  return (
    <div className="vreq">
      <div className="vreq-h">
        <span className="chip c-kind">{VRULES[req.kind].lbl}</span>
        <h3>{req.label}</h3>
        {statusChip}
      </div>
      <div className="meta">
        <b>{req.code}</b> {i?.titre || ""} · demandé par {req.by} le {fmt(req.at)}
        {req.decAt ? ` · ${req.st === "approuvee" ? "approuvée" : "rejetée"} le ${fmt(req.decAt)} par ${req.decBy}` : ""}
      </div>
      <ul>
        {req.lines.map((l, k) => (
          <li key={k}>{l}</li>
        ))}
        {req.motif && <li>Motif du rejet : {req.motif}</li>}
      </ul>
      {actionable &&
        (rejecting ? (
          <>
            <label className="field" htmlFor={`vm-${req.id}`}>
              Motif du rejet
              <textarea id={`vm-${req.id}`} value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={255} placeholder="Expliquez au demandeur ce qui doit changer" />
            </label>
            <div className="vreq-a">
              <button type="button" className="btn-ghost" onClick={() => setRejecting(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn red"
                onClick={() => {
                  if (!motif.trim()) return;
                  decideValidation(req.id, false, motif.trim());
                }}
              >
                Confirmer le rejet
              </button>
            </div>
          </>
        ) : (
          <div className="vreq-a">
            <button type="button" className="btn" onClick={() => decideValidation(req.id, true)}>
              Approuver
            </button>
            <button type="button" className="btn-ghost" onClick={() => setRejecting(true)}>
              Rejeter
            </button>
          </div>
        ))}
    </div>
  );
}

export default function ValidPage() {
  const { scopedInnos: innos, vals, profile, scopeDept } = useStore();
  const [ini, setIni] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const V = useMemo(
    () => vals.filter((r) => (!ini || r.code === ini) && (!kind || r.kind === kind) && (!from || r.at >= from) && (!to || r.at <= to) && innos.some((i) => i.code === r.code)),
    [vals, ini, kind, from, to, innos]
  );
  const pend = V.filter((r) => r.st === "attente");
  const mine = pend.filter((r) => isMine(r, profile, innos, scopeDept));
  const hist = V.filter((r) => r.st !== "attente");

  const subLabel =
    profile === "gest"
      ? "Le gestionnaire du portefeuille soumet les demandes ; changez de profil pour valider."
      : profile === "chef"
      ? "Demandes des initiatives de votre département"
      : `Demandes adressées au profil ${ROLES[profile]}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Circuit de validation</span>
          <h1>Validations</h1>
          <p className="lead">
            Certaines modifications ne s'appliquent qu'après accord : budget validé, retrait d'un bénéfice. Chaque
            demande arrive directement chez le bon validateur ; il approuve ou rejette en un clic.
          </p>
        </div>
        <span className="auto-chip">
          <i></i>Connecté : {ROLES[profile]}
        </span>
      </div>

      <div className="fbar">
        <label className="fb">
          Initiative
          <FilterCombobox value={ini} onChange={setIni} allLabel="Toutes" options={innos.map((i): [string, string] => [i.code, `${i.code} · ${i.titre}`])} />
        </label>
        <label className="fb">
          Type de demande
          <FilterCombobox value={kind} onChange={setKind} options={Object.entries(VRULES).map(([k, v]): [string, string] => [k, v.lbl])} />
        </label>
        <label className="fb">Date du<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="fb">au<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>À valider par vous</h2>
          <p className="sub">{subLabel}</p>
        </div>
        {mine.length === 0 ? (
          <div className="empty">
            <b>Aucune demande à valider</b>
            Les demandes qui vous sont adressées apparaîtront ici et dans « Mes actions ».
          </div>
        ) : (
          mine.map((r) => <VReqCard key={r.id} req={r} actionable innos={innos} />)
        )}
      </div>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Demandes en attente</h2>
          <p className="sub">Toutes les demandes non encore traitées, avec leur validateur</p>
        </div>
        {pend.length === 0 ? <div className="empty">Aucune demande en attente.</div> : pend.map((r) => <VReqCard key={r.id} req={r} actionable={false} innos={innos} />)}
      </div>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Historique</h2>
        </div>
        {hist.length === 0 ? <div className="empty">Aucune décision pour l'instant.</div> : hist.map((r) => <VReqCard key={r.id} req={r} actionable={false} innos={innos} />)}
      </div>

      <div className="panel">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Règles de validation</h2>
          <p className="sub">Paramétrables par l'administrateur fonctionnel</p>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Modification ou suppression</th>
                <th>Valideur</th>
                <th>Escalade</th>
              </tr>
            </thead>
            <tbody>
              {CIRCUIT.map(([a, b, c], k) => (
                <tr key={k}>
                  <td>{a}</td>
                  <td>
                    <b>{b}</b>
                  </td>
                  <td>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
