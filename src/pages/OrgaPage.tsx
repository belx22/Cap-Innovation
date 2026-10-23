import { useState } from "react";
import { useStore } from "../state/store";
import { DEPTS, DIRECTIONS, DIRECTION_DIRECTORS, USERS, UPROF, chefOf, deptName, directorOf, nextDeptId } from "../data/reference";
import UserPicker from "../components/UserPicker";
import type { DirectoryUser } from "../lib/identity";
import type { Departement, UserProfile, Utilisateur } from "../data/types";
import { hasRole, rolesOf, withRoles } from "../lib/roles";
import {
  deleteDepartment,
  deleteUser,
  createUser,
  persistDepartment,
  persistDirectionCreate,
  persistDirectionDirector,
  persistDirectionDelete,
  persistDirectionRename,
  persistUser,
  nextSharePointUserId,
  sharePointServiceHealth,
} from "../lib/sharepointSync";

type Kind = "dep" | "usr" | "dir";
interface EditState {
  k: Kind;
  id: string;
}

export default function OrgaPage() {
  const { innos, bump, logMessage, toast, sharePointReady } = useStore();
  const [oEdit, setOEdit] = useState<EditState | null>(null);
  const [oDel, setODel] = useState<EditState | null>(null);
  const [oUF, setOUF] = useState("");
  const [editLib, setEditLib] = useState("");
  const [editDir, setEditDir] = useState("");
  const [editNom, setEditNom] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editProf, setEditProf] = useState<UserProfile>("contrib");
  const [addDepLib, setAddDepLib] = useState("");
  const [addDepDir, setAddDepDir] = useState("");
  const [addDepChef, setAddDepChef] = useState("");
  const [chefTargetDept, setChefTargetDept] = useState<string | null>(null);
  const [pendingChef, setPendingChef] = useState<string | null>(null);
  const [addDirection, setAddDirection] = useState("");
  const [addDirectionDirector, setAddDirectionDirector] = useState("");
  const [editingDirection, setEditingDirection] = useState<string | null>(null);
  const [editDirectionLib, setEditDirectionLib] = useState("");
  const [pendingDirection, setPendingDirection] = useState<string | null>(null);
  const [orgaSection, setOrgaSection] = useState<"dep" | "usr" | "dir">("dep");

  const [addUsrOpen, setAddUsrOpen] = useState(false);
  const [addUsrNom, setAddUsrNom] = useState("");
  const [addUsrEmail, setAddUsrEmail] = useState("");
  const [addUsrDept, setAddUsrDept] = useState("");
  const [addUsrProf, setAddUsrProf] = useState<UserProfile>("contrib");
  const [selectedDirectoryUser, setSelectedDirectoryUser] = useState<DirectoryUser | null>(null);

  const [directionCatalog, setDirectionCatalog] = useState<string[]>(() => Array.from(new Set([...DIRECTIONS, ...DEPTS.map((d) => d.dir.trim()).filter(Boolean)])));
  const directions = Array.from(new Set([...directionCatalog, ...DIRECTIONS, ...DEPTS.map((d) => d.dir.trim()).filter(Boolean)])).sort((a, b) => a.localeCompare(b, "fr"));

  function cancel() {
    setOEdit(null);
    setODel(null);
  }

  function openAddUsr(prefill?: { dept?: string; prof?: UserProfile }) {
    setAddUsrNom("");
    setAddUsrEmail("");
    setSelectedDirectoryUser(null);
    setAddUsrDept(prefill?.dept || "");
    setAddUsrProf(prefill?.prof || "contrib");
    setAddUsrOpen(true);
  }
  function closeAddUsr() {
    setAddUsrOpen(false);
  }
  function pickDirectoryUser(u: DirectoryUser) {
    setSelectedDirectoryUser(u);
    setAddUsrNom(u.displayName);
    setAddUsrEmail(u.mail);
  }

  function startEditDep(id: string) {
    const x = DEPTS.find((d) => d.id === id)!;
    setOEdit({ k: "dep", id });
    setODel(null);
    setEditLib(x.lib);
    setEditDir(x.dir);
  }
  function startEditDirection(direction: string) {
    setEditingDirection(direction);
    setEditDirectionLib(direction);
    setOEdit(null);
    setODel(null);
  }
  async function saveDirection(direction: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement");
    const next = editDirectionLib.trim();
    if (!next) return toast("Le nom de la direction est obligatoire");
    if (directions.some((x) => x !== direction && x.toLowerCase() === next.toLowerCase())) return toast("Cette direction existe déjà");
    setPendingDirection(direction);
    try {
      await persistDirectionRename(direction, next);
      DEPTS.forEach((d) => { if (d.dir === direction) d.dir = next; });
      const globalIndex = DIRECTIONS.indexOf(direction);
      if (globalIndex >= 0) DIRECTIONS[globalIndex] = next;
      if (DIRECTION_DIRECTORS[direction]) {
        DIRECTION_DIRECTORS[next] = DIRECTION_DIRECTORS[direction];
        delete DIRECTION_DIRECTORS[direction];
      }
      setDirectionCatalog((items) => items.map((item) => item === direction ? next : item));
      setEditingDirection(null);
      setEditDirectionLib("");
      bump();
      toast("Direction modifiée et confirmée dans SharePoint");
    } catch (error) {
      console.error("Direction non modifiée dans SharePoint", error);
      toast(`Modification impossible : ${sharePointServiceHealth(error)}`, "error");
    } finally {
      setPendingDirection(null);
    }
  }
  async function deleteDirection(direction: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement");
    if (DEPTS.some((d) => d.dir === direction)) return toast("Cette direction est encore rattachée à un département");
    setPendingDirection(direction);
    try {
      await persistDirectionDelete(direction);
      setDirectionCatalog((items) => items.filter((item) => item !== direction));
      const globalIndex = DIRECTIONS.indexOf(direction);
      if (globalIndex >= 0) DIRECTIONS.splice(globalIndex, 1);
      delete DIRECTION_DIRECTORS[direction];
      setEditingDirection(null);
      bump();
      toast("Direction supprimée et confirmée dans SharePoint");
    } catch (error) {
      console.error("Direction non supprimée dans SharePoint", error);
      toast(`Suppression impossible : ${sharePointServiceHealth(error)}`, "error");
    } finally {
      setPendingDirection(null);
    }
  }
  async function assignExistingChef(deptId: string, userId: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement", "error");
    const department = DEPTS.find((item) => item.id === deptId);
    const user = USERS.find((item) => item.id === userId);
    if (!department || !user) return toast("Sélectionnez un utilisateur existant", "error");
    if (hasRole(user, "chef") || innos.some((i) => i.porteurId === user.id)) return toast("Choisissez un utilisateur sans rôle de chef et sans initiative portée", "error");
    if (chefOf(deptId)) return toast("Ce département possède déjà un chef", "error");
    const previousDepartment = DEPTS.find((item) => item.id === user.dept);
    const nextUser: Utilisateur = withRoles({ ...user, dept: deptId }, [...rolesOf(user), "chef"]);
    setPendingChef(deptId);
    try {
      await persistUser(nextUser);
      await persistDepartment(department, user.email);
      if (previousDepartment && previousDepartment.id !== deptId && chefOf(previousDepartment.id)?.id === user.id) {
        await persistDepartment(previousDepartment);
      }
      Object.assign(user, nextUser);
      setChefTargetDept(null);
      bump();
      toast(`Chef de département désigné : ${user.nom}`);
    } catch (error) {
      console.error("Chef de département non désigné dans SharePoint", error);
      toast(`Désignation impossible : ${sharePointServiceHealth(error)}`, "error");
    } finally {
      setPendingChef(null);
    }
  }
  async function createDirection() {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement");
    const direction = addDirection.trim();
    if (!direction) return toast("Le nom de la direction est obligatoire");
    if (!addDirectionDirector) return toast("Choisissez le directeur de la direction");
    if (directions.some((x) => x.toLowerCase() === direction.toLowerCase())) return toast("Cette direction existe déjà");
    const director = USERS.find((user) => user.id === addDirectionDirector);
    if (!director) return toast("Sélectionnez un utilisateur existant comme directeur");
    const nextDirector = withRoles(director, [...rolesOf(director), "dir"]);
    setPendingDirection("__create__");
    try {
      await Promise.all([persistDirectionCreate(direction, director.id), persistUser(nextDirector)]);
      setDirectionCatalog((items) => [...items, direction]);
      DIRECTIONS.push(direction);
      DIRECTION_DIRECTORS[direction] = director.id;
      Object.assign(director, nextDirector);
      setAddDirection("");
      setAddDirectionDirector("");
      bump();
      toast("Direction et directeur enregistrés dans SharePoint");
    } catch (error) {
      console.error("Direction non créée dans SharePoint", error);
      toast(`Création impossible : ${sharePointServiceHealth(error)}`, "error");
    } finally {
      setPendingDirection(null);
    }
  }
  async function assignDirectionDirector(direction: string, userId: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement", "error");
    const user = USERS.find((item) => item.id === userId);
    if (!user) return toast("Sélectionnez un utilisateur existant", "error");
    const nextUser = withRoles(user, [...rolesOf(user), "dir"]);
    setPendingDirection(direction);
    try {
      await Promise.all([persistDirectionDirector(direction, user.id), persistUser(nextUser)]);
      DIRECTION_DIRECTORS[direction] = user.id;
      Object.assign(user, nextUser);
      bump();
      toast(`Directeur de ${direction} enregistré dans SharePoint`);
    } catch (error) {
      console.error("Directeur de direction non enregistré dans SharePoint", error);
      toast(`Désignation impossible : ${sharePointServiceHealth(error)}`, "error");
    } finally {
      setPendingDirection(null);
    }
  }
  function startEditUsr(id: string) {
    const u = USERS.find((x) => x.id === id)!;
    setOEdit({ k: "usr", id });
    setODel(null);
    setEditNom(u.nom);
    setEditEmail(u.email || "");
    setEditDept(u.dept);
    setEditProf(u.prof);
  }

  async function saveDep(id: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement", "error");
    const x = DEPTS.find((d) => d.id === id)!;
    const lib = editLib.trim();
    const dir = editDir.trim();
    if (!lib) return toast("Le nom du département est obligatoire");
    if (DEPTS.some((y) => y !== x && y.lib.toLowerCase() === lib.toLowerCase())) return toast("Ce département existe déjà");
    const next: Departement = { ...x, lib, dir };
    try {
      await persistDepartment(next, chefOf(id)?.email);
      if (lib !== x.lib || dir !== x.dir) logMessage(`Organisation · Département « ${x.lib} » modifié : ${lib}${dir ? ` (${dir})` : ""}.`);
      Object.assign(x, next);
      setOEdit(null);
      bump();
      toast("Département modifié et confirmé dans SharePoint");
    } catch (error) {
      console.error("Département non modifié dans SharePoint", error);
      toast(`Modification impossible : ${sharePointServiceHealth(error)}`, "error");
    }
  }

  async function saveUsr(id: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement", "error");
    const u = USERS.find((x) => x.id === id)!;
    const nom = editNom.trim();
    const email = editEmail.trim();
    const dept = editDept;
    const prof = editProf;
    if (!nom) return toast("Le nom est obligatoire");
    if (email && !email.includes("@")) return toast("Adresse e-mail invalide");
    if (email && USERS.some((x) => x !== u && x.email?.toLowerCase() === email.toLowerCase())) return toast("Cette adresse e-mail est déjà rattachée à un autre utilisateur");
    if (prof === "chef") {
      const c = chefOf(dept);
      if (c && c !== u) return toast(`${deptName(dept)} a déjà un chef : ${c.nom}`);
    }
    const ch: string[] = [];
    if (nom !== u.nom) ch.push(`nom ${u.nom} → ${nom}`);
    if (email !== (u.email || "")) ch.push(`e-mail ${u.email || "—"} → ${email || "—"}`);
    if (dept !== u.dept) ch.push(`département ${deptName(u.dept)} → ${deptName(dept)}`);
    if (prof !== u.prof) ch.push(`profil ${UPROF[u.prof]} → ${UPROF[prof]}`);
    const next: Utilisateur = withRoles({ ...u, nom, email: email || undefined, dept }, [...rolesOf(u), prof]);
    const projectedUsers = USERS.map((user) => user.id === id ? next : user);
    const affectedDepartments = Array.from(new Set([u.dept, dept]))
      .map((deptId) => DEPTS.find((item) => item.id === deptId))
      .filter((item): item is Departement => !!item);
    try {
      await Promise.all([
        persistUser(next),
        ...affectedDepartments.map((department) => persistDepartment(
          department,
          projectedUsers.find((user) => user.dept === department.id && hasRole(user, "chef"))?.email,
        )),
      ]);
      if (ch.length) logMessage(`Organisation · Utilisateur « ${u.nom} » modifié : ${ch.join(", ")}.${dept !== u.dept ? " Ses initiatives déjà créées restent rattachées à leur département." : ""}`);
      innos.forEach((i) => {
        if (i.porteurId === u.id) i.porteur = nom;
      });
      Object.assign(u, next);
      setOEdit(null);
      bump();
      toast("Utilisateur modifié et confirmé dans SharePoint");
    } catch (error) {
      console.error("Utilisateur non modifié dans SharePoint", error);
      toast(`Modification impossible : ${sharePointServiceHealth(error)}`, "error");
    }
  }

  async function deleteDep(id: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement", "error");
    const x = DEPTS.find((d) => d.id === id)!;
    if (USERS.some((u) => u.dept === id) || innos.some((i) => i.dept === id)) return toast("Département encore utilisé");
    try {
      await deleteDepartment(id);
      DEPTS.splice(DEPTS.indexOf(x), 1);
      logMessage(`Organisation · Département « ${x.lib} » supprimé.`);
      setODel(null);
      bump();
      toast("Département supprimé et confirmé dans SharePoint");
    } catch (error) {
      console.error("Département non supprimé dans SharePoint", error);
      toast(`Suppression impossible : ${sharePointServiceHealth(error)}`, "error");
    }
  }
  async function deleteUsr(id: string) {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement", "error");
    const u = USERS.find((x) => x.id === id)!;
    if (innos.some((i) => i.porteurId === id)) return toast("Utilisateur porteur d'initiatives");
    const department = DEPTS.find((item) => item.id === u.dept);
    try {
      await deleteUser(id);
      if (department && hasRole(u, "chef")) await persistDepartment(department);
      USERS.splice(USERS.indexOf(u), 1);
      logMessage(`Organisation · Utilisateur « ${u.nom} » supprimé.`);
      setODel(null);
      bump();
      toast("Utilisateur supprimé et confirmé dans SharePoint");
    } catch (error) {
      console.error("Utilisateur non supprimé dans SharePoint", error);
      toast(`Suppression impossible : ${sharePointServiceHealth(error)}`, "error");
    }
  }

  async function addDep() {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement", "error");
    const lib = addDepLib.trim();
    const dir = addDepDir.trim();
    if (!lib) return;
    if (!addDepChef) return toast("Choisissez le chef du département avant de l'ajouter");
    if (DEPTS.some((y) => y.lib.toLowerCase() === lib.toLowerCase())) return toast("Ce département existe déjà");
    const id = nextDeptId();
    const chef = USERS.find((u) => u.id === addDepChef);
    if (!chef || hasRole(chef, "chef") || innos.some((i) => i.porteurId === chef.id)) {
      return toast("Choisissez un utilisateur sans rôle de chef et sans initiative portée comme chef");
    }
    const department: Departement = { id, lib, dir };
    const nextChef: Utilisateur = withRoles({ ...chef, dept: id }, [...rolesOf(chef), "chef"]);
    try {
      await Promise.all([persistDepartment(department, chef.email), persistUser(nextChef)]);
      DEPTS.push(department);
      Object.assign(chef, nextChef);
      logMessage(`Organisation · Département « ${lib} » créé${dir ? ` (${dir})` : ""}, chef : ${chef.nom}.`);
      setAddDepLib("");
      setAddDepDir("");
      setAddDepChef("");
      bump();
      toast("Département ajouté avec son chef et confirmé dans SharePoint");
    } catch (error) {
      console.error("Département non créé dans SharePoint", error);
      toast(`Création impossible : ${sharePointServiceHealth(error)}`, "error");
    }
  }
  async function addUsr() {
    if (!sharePointReady) return toast("SharePoint est encore en cours de chargement", "error");
    const nom = addUsrNom.trim();
    const email = addUsrEmail.trim();
    const dept = addUsrDept;
    const prof = addUsrProf;
    if (!selectedDirectoryUser || !nom || !email) return toast("Sélectionnez un compte dans l'annuaire Microsoft 365");
    if (!dept) return toast("Précisez le département de l'utilisateur");
    if (!email.includes("@")) return toast("Adresse e-mail invalide");
    if (USERS.some((u) => u.nom.toLowerCase() === nom.toLowerCase())) return toast("Cet utilisateur existe déjà");
    if (USERS.some((u) => u.email?.toLowerCase() === email.toLowerCase())) return toast("Cette adresse e-mail est déjà rattachée à un autre utilisateur");
    const c = chefOf(dept);
    if (prof === "chef" && c) return toast(`${deptName(dept)} a déjà un chef : ${c.nom}`);
    const department = DEPTS.find((item) => item.id === dept);
    try {
      const id = await nextSharePointUserId();
      const user: Utilisateur = withRoles({ id, nom, email, dept }, [prof]);
      await createUser(user);
      if (prof === "chef" && department) await persistDepartment(department, email);
      USERS.push(user);
      logMessage(`Organisation · Utilisateur « ${nom} » créé depuis l'annuaire Office 365 : ${deptName(dept)}, ${UPROF[prof]}.`);
      bump();
      toast("Utilisateur ajouté · workflow d'accès SharePoint en modification déclenché");
      closeAddUsr();
    } catch (error) {
      console.error("Utilisateur non créé dans SharePoint", error);
      toast(`Création impossible : ${sharePointServiceHealth(error)}`, "error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="top">
        <div>
          <span className="eyebrow">Administration · réservé à l'administrateur fonctionnel</span>
          <h1>Départements et utilisateurs</h1>
          <p className="lead">
            Créez les départements, puis les utilisateurs avec leur département. Le porteur d'une initiative étant un
            utilisateur, l'initiative appartient automatiquement à son département.
          </p>
        </div>
      </div>

      <nav className="subnav" aria-label="Administration de l'organisation">
        <button type="button" className={orgaSection === "dep" ? "active" : ""} onClick={() => setOrgaSection("dep")}>
          Départements
        </button>
        <button type="button" className={orgaSection === "usr" ? "active" : ""} onClick={() => setOrgaSection("usr")}>
          Utilisateurs
        </button>
        <button type="button" className={orgaSection === "dir" ? "active" : ""} onClick={() => setOrgaSection("dir")}>
          Directions
        </button>
      </nav>

      {orgaSection === "dep" && <div className="panel" id="departements">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Départements</h2>
          <p className="sub">Le chef de département est l'utilisateur du département qui a le profil « Chef de département »</p>
        </div>
        <div className="tbl-wrap">
          <table className="vt rt">
            <thead>
              <tr>
                <th>Département</th>
                <th>Direction</th>
                <th>Chef de département</th>
                <th>Membres</th>
                <th>Initiatives</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {DEPTS.map((x) => {
                const m = USERS.filter((u) => u.dept === x.id).length;
                const n = innos.filter((i) => i.dept === x.id).length;
                const c = chefOf(x.id);
                const editing = oEdit?.k === "dep" && oEdit.id === x.id;
                const deleting = oDel?.k === "dep" && oDel.id === x.id;
                return (
                  <tr key={x.id}>
                    <td>{editing ? <div className="r-edit"><input value={editLib} onChange={(e) => setEditLib(e.target.value)} maxLength={60} aria-label="Nom du département" /></div> : <b>{x.lib}</b>}</td>
                    <td>{editing ? <select value={editDir} onChange={(e) => setEditDir(e.target.value)} aria-label="Direction"><option value="">Choisir…</option>{directions.map((d) => <option key={d} value={d}>{d}</option>)}</select> : x.dir || "—"}</td>
                    <td>
                      {c ? (
                        c.nom
                      ) : (
                          <span className="r-edit">
                            <span className="chip c-en_retard">À désigner</span>
                          {chefTargetDept === x.id ? <>
                            <select value="" disabled={pendingChef === x.id} onChange={(e) => assignExistingChef(x.id, e.target.value)} aria-label={`Utilisateur chef de ${x.lib}`}>
                              <option value="">Choisir un utilisateur existant…</option>
                              {USERS.filter((u) => !hasRole(u, "chef") && !innos.some((i) => i.porteurId === u.id)).map((u) => <option key={u.id} value={u.id}>{u.nom} · {u.email || "e-mail non renseigné"}</option>)}
                            </select>
                            <button type="button" className="btn-ghost sm" disabled={pendingChef === x.id} onClick={() => setChefTargetDept(null)}>Annuler</button>
                          </> : <button type="button" className="btn-ghost sm" onClick={() => setChefTargetDept(x.id)}>
                            Choisir un chef existant
                          </button>}
                          </span>
                      )}
                    </td>
                    <td className="mono">{m}</td>
                    <td className="mono">{n}</td>
                    <td>
                      {editing ? (
                        <div className="vreq-a">
                          <button type="button" className="btn sm" onClick={() => saveDep(x.id)}>Enregistrer</button>
                          <button type="button" className="btn-ghost sm" onClick={cancel}>Annuler</button>
                        </div>
                      ) : deleting ? (
                        <div className="vreq-a">
                          <button type="button" className="btn red sm" onClick={() => deleteDep(x.id)}>Confirmer la suppression</button>
                          <button type="button" className="btn-ghost sm" onClick={cancel}>Annuler</button>
                        </div>
                      ) : (
                        <div className="vreq-a">
                          <button type="button" className="btn-ghost sm" onClick={() => startEditDep(x.id)}>Modifier</button>
                          <button type="button" className="btn-ghost sm" disabled={!!(m || n)} title={m || n ? `${m} membre(s) et ${n} initiative(s) : réaffectez-les avant de supprimer` : undefined} onClick={() => { setODel({ k: "dep", id: x.id }); setOEdit(null); }}>
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
        <div className="r-addf o4">
          <label className="field">
            Nouveau département
            <input value={addDepLib} onChange={(e) => setAddDepLib(e.target.value)} maxLength={60} placeholder="Ex. Monétique" />
          </label>
          <label className="field">
            Direction de rattachement
            <select value={addDepDir} onChange={(e) => setAddDepDir(e.target.value)} aria-label="Direction de rattachement">
              <option value="">Choisir une direction…</option>
              {directions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="field">
            Chef de département
            <select value={addDepChef} onChange={(e) => setAddDepChef(e.target.value)}>
              <option value="">Choisir le chef…</option>
              {USERS.filter((u) => !hasRole(u, "chef") && !innos.some((i) => i.porteurId === u.id)).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nom} · {u.email}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-ghost" onClick={addDep}>
            + Ajouter le département
          </button>
        </div>
      </div>}

      {orgaSection === "dir" && <div className="panel" id="directions">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2>Directions</h2>
          <p className="sub">Référentiel utilisé pour rattacher chaque département à une direction.</p>
        </div>
        <div className="tbl-wrap">
          <table className="vt rt">
            <thead><tr><th>Direction</th><th>Directeur</th><th>Départements rattachés</th><th></th></tr></thead>
            <tbody>
              {directions.map((direction) => {
                const count = DEPTS.filter((d) => d.dir === direction).length;
                const editing = editingDirection === direction;
                const director = directorOf(direction);
                return <tr key={direction}>
                  <td>{editing ? <input value={editDirectionLib} onChange={(e) => setEditDirectionLib(e.target.value)} aria-label="Nom de la direction" /> : <b>{direction}</b>}</td>
                  <td><select value={director?.id || ""} disabled={pendingDirection !== null} onChange={(e) => assignDirectionDirector(direction, e.target.value)} aria-label={`Directeur de ${direction}`}><option value="">Choisir le directeur…</option>{USERS.map((user) => <option key={user.id} value={user.id}>{user.nom} · {user.email || "e-mail non renseigné"}</option>)}</select></td>
                  <td className="mono">{count}</td>
                  <td><div className="vreq-a">{editing ? <><button type="button" className="btn sm" disabled={pendingDirection === direction} onClick={() => saveDirection(direction)}>{pendingDirection === direction ? "Enregistrement…" : "Enregistrer"}</button><button type="button" className="btn-ghost sm" disabled={pendingDirection === direction} onClick={() => setEditingDirection(null)}>Annuler</button></> : <><button type="button" className="btn-ghost sm" disabled={pendingDirection !== null} onClick={() => startEditDirection(direction)}>Modifier</button><button type="button" className="btn-ghost sm" disabled={count > 0 || pendingDirection !== null} onClick={() => deleteDirection(direction)}>{pendingDirection === direction ? "Suppression…" : "Supprimer"}</button></>}</div></td>
                </tr>;
              })}
              {!directions.length && <tr><td colSpan={4} className="hint">Aucune direction enregistrée.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="r-addf o4">
          <label className="field">Nouvelle direction<input value={addDirection} onChange={(e) => setAddDirection(e.target.value)} maxLength={80} placeholder="Ex. Direction des Opérations" /></label>
          <label className="field">Directeur<select value={addDirectionDirector} onChange={(e) => setAddDirectionDirector(e.target.value)}><option value="">Choisir le directeur…</option>{USERS.map((user) => <option key={user.id} value={user.id}>{user.nom} · {user.email || "e-mail non renseigné"}</option>)}</select></label>
          <button type="button" className="btn-ghost" disabled={pendingDirection !== null} onClick={createDirection}>{pendingDirection === "__create__" ? "Enregistrement SharePoint…" : "+ Ajouter la direction"}</button>
        </div>
      </div>}

      {orgaSection === "usr" && <div className="panel" id="utilisateurs">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <h2>Utilisateurs</h2>
            <p className="sub">Nom, département et profil ; les rôles sur les initiatives sont attribués à leur création</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <label className="fb">
              Département
              <select value={oUF} onChange={(e) => setOUF(e.target.value)}>
                <option value="">Tous</option>
                {DEPTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.lib}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-ghost" onClick={() => openAddUsr()}>
              + Ajouter un utilisateur
            </button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="vt rt">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>E-mail</th>
                <th>Département</th>
                <th>Profil</th>
                <th>Initiatives portées</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {USERS.filter((u) => !oUF || u.dept === oUF).map((u) => {
                const n = innos.filter((i) => i.porteurId === u.id).length;
                const editing = oEdit?.k === "usr" && oEdit.id === u.id;
                const deleting = oDel?.k === "usr" && oDel.id === u.id;
                return (
                  <tr key={u.id}>
                    <td>{editing ? <div className="r-edit"><input value={editNom} onChange={(e) => setEditNom(e.target.value)} maxLength={60} aria-label="Nom" /></div> : <b>{u.nom}</b>}</td>
                    <td className="mono">
                      {editing ? (
                        <div className="r-edit">
                          <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} maxLength={120} aria-label="E-mail" placeholder="prenom.nom@afrilandfirstbank.com" />
                        </div>
                      ) : (
                        u.email || <span className="n">Non renseigné</span>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select value={editDept} onChange={(e) => setEditDept(e.target.value)} aria-label="Département">
                          {DEPTS.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.lib}
                            </option>
                          ))}
                        </select>
                      ) : (
                        deptName(u.dept)
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select value={editProf} onChange={(e) => setEditProf(e.target.value as UserProfile)} aria-label="Profil">
                          {Object.entries(UPROF).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      ) : (
                        rolesOf(u).map((role) => UPROF[role]).join(" · ")
                      )}
                    </td>
                    <td className="mono">{n}</td>
                    <td>
                      {editing ? (
                        <div className="vreq-a">
                          <button type="button" className="btn sm" onClick={() => saveUsr(u.id)}>Enregistrer</button>
                          <button type="button" className="btn-ghost sm" onClick={cancel}>Annuler</button>
                        </div>
                      ) : deleting ? (
                        <div className="vreq-a">
                          <button type="button" className="btn red sm" onClick={() => deleteUsr(u.id)}>Confirmer la suppression</button>
                          <button type="button" className="btn-ghost sm" onClick={cancel}>Annuler</button>
                        </div>
                      ) : (
                        <div className="vreq-a">
                          <button type="button" className="btn-ghost sm" onClick={() => startEditUsr(u.id)}>Modifier</button>
                          <button type="button" className="btn-ghost sm" disabled={!!n} title={n ? `Porteur de ${n} initiative(s) : réaffectez-les d'abord` : undefined} onClick={() => { setODel({ k: "usr", id: u.id }); setOEdit(null); }}>
                            Supprimer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {USERS.filter((u) => !oUF || u.dept === oUF).length === 0 && (
                <tr>
                  <td colSpan={6} className="hint">Aucun utilisateur.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>}

      {addUsrOpen && (
        <>
          <div className="scrim" onClick={closeAddUsr} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="au-title">
            <div className="d-head">
              <div>
                <span className="eyebrow">Annuaire Microsoft 365</span>
                <h2 id="au-title">{addUsrProf === "chef" ? "Désigner un chef de département" : "Ajouter un utilisateur"}</h2>
                <p className="sub">Recherchez un compte de l'annuaire d'entreprise, puis définissez son département et son profil.</p>
              </div>
              <button className="x" aria-label="Fermer" onClick={closeAddUsr}>
                ×
              </button>
            </div>
            <div className="d-body">
              <label className="field" htmlFor="au-search">
                Rechercher dans l'annuaire
                <UserPicker onPick={pickDirectoryUser} excludeEmails={USERS.map((u) => (u.email || "").toLowerCase())} />
              </label>
              <label className="field" htmlFor="au-nom">
                Nom
                <input id="au-nom" value={addUsrNom} readOnly placeholder="Sélectionnez un compte ci-dessus" />
              </label>
              <label className="field" htmlFor="au-email">
                E-mail
                <input id="au-email" value={addUsrEmail} readOnly placeholder="Récupéré depuis l'annuaire Microsoft 365" />
              </label>
              {selectedDirectoryUser && <p className="hint">Compte Microsoft sélectionné : {selectedDirectoryUser.mail}</p>}
              <label className="field" htmlFor="au-dept">
                Département
                <select id="au-dept" value={addUsrDept} onChange={(e) => setAddUsrDept(e.target.value)}>
                  <option value="">Choisir…</option>
                  {DEPTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.lib}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="au-prof">
                Profil
                <select id="au-prof" value={addUsrProf} onChange={(e) => setAddUsrProf(e.target.value as UserProfile)}>
                  {Object.entries(UPROF).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {addUsrProf === "chef" &&
                addUsrDept &&
                (() => {
                  const existing = chefOf(addUsrDept);
                  return existing ? (
                    <p className="hint err">
                      {deptName(addUsrDept)} a déjà un chef : {existing.nom}. Changez de département ou de profil.
                    </p>
                  ) : (
                    <p className="hint">Cette personne sera désignée chef de {deptName(addUsrDept)}.</p>
                  );
                })()}
            </div>
            <div className="d-foot">
              <div className="btns">
                <button type="button" className="btn-ghost" onClick={closeAddUsr}>
                  Annuler
                </button>
                <button type="button" className="btn" disabled={!selectedDirectoryUser || !addUsrDept} onClick={addUsr}>
                  {addUsrProf === "chef" ? "Désigner le chef" : "Ajouter l'utilisateur"}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
