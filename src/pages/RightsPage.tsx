import { useMemo, useState } from "react";
import { UPROF, USERS } from "../data/reference";
import type { UserProfile } from "../data/types";
import { rolesOf, withRoles } from "../lib/roles";
import { persistUser, sharePointServiceHealth } from "../lib/sharepointSync";
import { useStore } from "../state/store";

const ROLE_ORDER: UserProfile[] = ["contrib", "gest", "chef", "dir", "admin"];

const RIGHTS: { label: string; roles: UserProfile[] }[] = [
  { label: "Créer et suivre ses initiatives", roles: ["contrib", "gest", "chef", "dir", "admin"] },
  { label: "Voir les initiatives de son département", roles: ["chef", "dir", "admin"] },
  { label: "Gérer le portefeuille et le planning", roles: ["gest", "dir", "admin"] },
  { label: "Valider les demandes attribuées", roles: ["chef", "dir", "admin"] },
  { label: "Gérer piliers et programmes", roles: ["chef", "dir", "admin"] },
  { label: "Gérer l'organisation, les profils et les référentiels", roles: ["admin"] },
];

export default function RightsPage() {
  const { bump, toast, sharePointReady } = useStore();
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const users = useMemo(() => USERS.filter((user) => `${user.nom} ${user.email || ""}`.toLowerCase().includes(filter.trim().toLowerCase())), [filter]);

  async function toggleRole(id: string, role: UserProfile) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement", "error");
    const user = USERS.find((item) => item.id === id);
    if (!user) return;
    const current = rolesOf(user);
    const nextRoles = current.includes(role) ? current.filter((item) => item !== role) : [...current, role];
    if (!nextRoles.length) return toast("Chaque utilisateur doit conserver au moins un profil", "error");
    const next = withRoles(user, nextRoles);
    setPending(id);
    try {
      await persistUser(next);
      Object.assign(user, next);
      bump();
      toast(`Droits de ${user.nom} enregistrés dans SharePoint`);
    } catch (error) {
      console.error("Droits utilisateur non enregistrés", error);
      toast(`Enregistrement impossible : ${sharePointServiceHealth(error)}`, "error");
    } finally {
      setPending(null);
    }
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
    <div className="top">
      <div>
        <span className="eyebrow">Administration · réservé à l'administrateur fonctionnel</span>
        <h1>Droits et profils</h1>
        <p className="lead">Attribuez plusieurs profils à un même utilisateur. Les rôles sont enregistrés directement dans la liste SharePoint <b>02_Utilisateurs</b> ; le rôle le plus élevé définit ses droits globaux.</p>
      </div>
    </div>

    <section className="panel">
      <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
        <h2>Droits associés aux profils</h2>
        <p className="sub">Référentiel appliqué dans l'application. Un rôle supplémentaire complète les droits déjà attribués.</p>
      </div>
      <div className="tbl-wrap"><table className="vt rt"><thead><tr><th>Fonctionnalité</th>{ROLE_ORDER.map((role) => <th key={role}>{UPROF[role]}</th>)}</tr></thead><tbody>
        {RIGHTS.map((right) => <tr key={right.label}><td><b>{right.label}</b></td>{ROLE_ORDER.map((role) => <td key={role} aria-label={`${right.label} · ${UPROF[role]}`}>{right.roles.includes(role) ? "✓" : "—"}</td>)}</tr>)}
      </tbody></table></div>
    </section>

    <section className="panel">
      <div className="pad" style={{ borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
        <div><h2>Attribution des profils</h2><p className="sub">Cochez un ou plusieurs profils puis attendez la confirmation SharePoint.</p></div>
        <label className="field" style={{ minWidth: 260 }}>Rechercher un utilisateur<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Nom ou e-mail" /></label>
      </div>
      <div className="tbl-wrap"><table className="vt rt"><thead><tr><th>Utilisateur</th><th>E-mail</th>{ROLE_ORDER.map((role) => <th key={role}>{UPROF[role]}</th>)}</tr></thead><tbody>
        {users.map((user) => { const assigned = rolesOf(user); const waiting = pending === user.id; return <tr key={user.id}><td><b>{user.nom}</b></td><td className="mono">{user.email || "Non renseigné"}</td>{ROLE_ORDER.map((role) => <td key={role}><label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: waiting ? "wait" : "pointer" }}><input type="checkbox" checked={assigned.includes(role)} disabled={waiting || (assigned.length === 1 && assigned.includes(role))} onChange={() => toggleRole(user.id, role)} /><span className="sr-only">{UPROF[role]}</span></label></td>)}</tr>; })}
        {!users.length && <tr><td colSpan={7} className="hint">Aucun utilisateur ne correspond à la recherche.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
