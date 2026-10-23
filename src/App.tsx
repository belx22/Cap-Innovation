import { useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import Toast from "./components/Toast";
import JalonDrawer from "./components/JalonDrawer";
import StepsDrawer from "./components/StepsDrawer";
import PlaceholderPage from "./pages/PlaceholderPage";
import ActionsPage from "./pages/ActionsPage";
import DashboardPage from "./pages/DashboardPage";
import PortfolioPage from "./pages/PortfolioPage";
import PlanningPage from "./pages/PlanningPage";
import CreatePage from "./pages/CreatePage";
import AutoPage from "./pages/AutoPage";
import JustifsPage from "./pages/JustifsPage";
import StratPage from "./pages/StratPage";
import DeptPage from "./pages/DeptPage";
import RecosPage from "./pages/RecosPage";
import BensPage from "./pages/BensPage";
import BudgetsPage from "./pages/BudgetsPage";
import ValidPage from "./pages/ValidPage";
import OrgaPage from "./pages/OrgaPage";
import TypesPage from "./pages/TypesPage";
import ImportsPage from "./pages/ImportsPage";
import RightsPage from "./pages/RightsPage";
import SettingsPage from "./pages/SettingsPage";
import NotificationsPanel from "./components/NotificationsPanel";
import { useStore } from "./state/store";
import { actions as computeActions } from "./lib/domain";
import { deptName, UPROF } from "./data/reference";

export type Screen =
  | "actions"
  | "dash"
  | "portefeuille"
  | "dept"
  | "planning"
  | "justifs"
  | "recos"
  | "bens"
  | "budgets"
  | "valid"
  | "strat"
  | "auto"
  | "types"
  | "orga"
  | "rights"
  | "imports"
  | "settings"
  | "creer";

const SCREEN_LABELS: Record<Screen, string> = {
  actions: "Mes actions", dash: "Dashboard", portefeuille: "Portefeuille", dept: "Départements",
  planning: "Planning", justifs: "Justificatifs", recos: "Recommandations", bens: "Bénéfices",
  budgets: "Budgets et valeur", valid: "Validations", strat: "Piliers et programmes", auto: "Automatisations",
  types: "Types d'initiative", orga: "Départements et utilisateurs", rights: "Droits et profils", imports: "Modèles d'import", settings: "Paramètres", creer: "Nouvelle initiative",
};

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const requested = new URLSearchParams(window.location.search).get("screen");
    return requested === "valid" ? "valid" : "actions";
  });
  const [openJalonId, setOpenJalonId] = useState<string | null>(null);
  const [openStepsCode, setOpenStepsCode] = useState<string | null>(null);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const { scopedInnos: innos, log, profile, notifications, me, requestInitiativeEdit, requestBudgetChange } = useStore();
  const identityEmail = (me.email || "").trim().toLowerCase();

  const actionsCount = useMemo(() => computeActions(innos).length, [innos]);
  const autoRate = useMemo(() => {
    if (!log.length) return "—";
    const sys = log.filter((l) => l.sys).length;
    return Math.round((100 * sys) / log.length) + " %";
  }, [log]);
  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read && (!identityEmail || n.recipientEmail.trim().toLowerCase() === identityEmail)).length,
    [notifications, identityEmail]
  );

  // Les deux tiroirs (jalon seul / initiative entière) se ferment mutuellement :
  // un seul peut être ouvert à la fois, comme dans le prototype.
  function openInitiative(code: string) {
    setOpenJalonId(null);
    setOpenStepsCode(code);
  }
  function editInitiative(code: string) {
    setOpenJalonId(null);
    setOpenStepsCode(null);
    setEditCode(code);
    setScreen("creer");
  }

  function navigate(next: Screen) {
    setEditCode(null);
    setScreen(next);
  }

  const editedInitiative = editCode ? innos.find((initiative) => initiative.code === editCode) : undefined;
  function openJalon(id: string) {
    setOpenStepsCode(null);
    setOpenJalonId(id);
  }

  const isAdminScreen = screen === "types" || screen === "orga" || screen === "rights" || screen === "imports" || screen === "settings";
  const adminBlocked = isAdminScreen && profile !== "admin";
  const connected = Boolean(me.email || me.id);
  const initials = (me.nom || "U").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  function disconnect() {
    const redirect = encodeURIComponent(window.location.href.split("#")[0]);
    window.location.assign(`https://login.microsoftonline.com/common/oauth2/v2.0/logout?post_logout_redirect_uri=${redirect}`);
  }

  return (
    <div className="app">
      <Sidebar screen={screen} onNavigate={navigate} actionsCount={actionsCount} autoRate={autoRate} />
      <main>
        <div className="app-topbar">
          <div className="topbar-breadcrumbs"><span>Portefeuille DEI</span><i>›</i><b>{screen === "creer" && editedInitiative ? "Modifier l’initiative" : SCREEN_LABELS[screen]}</b></div>
          <label className="global-search" aria-label="Rechercher dans l'application">
            <span aria-hidden="true">⌕</span>
            <input value={globalQuery} onChange={(e) => setGlobalQuery(e.target.value)} placeholder="Rechercher une initiative, un titre, une page..." />
          </label>
          <div className="topbar-actions">
            <div className="language-switch" aria-label="Langue"><b>FR</b><span>EN</span><span>€</span></div>
            <button type="button" className="bell" onClick={() => setNotificationsOpen(true)} aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} non lues` : ""}`}>
              <span aria-hidden="true">🔔</span>
              {!!unreadNotifications && <b>{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>}
            </button>
            <div className="user-menu">
              <button type="button" className="user-trigger" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen((open) => !open)}>
                <span className="user-avatar" aria-hidden="true">{initials || "U"}</span>
                <span className="user-summary">
                  <b>{connected ? me.nom : "Utilisateur"}</b>
                  <small>{connected ? "Connecté" : "Non connecté"}</small>
                </span>
                <span className="user-chevron" aria-hidden="true">⌄</span>
              </button>
              {profileOpen && <div className="user-popover" role="menu" aria-label="Menu utilisateur">
                <div className="user-popover-head">
                  <span className="user-avatar large" aria-hidden="true">{initials || "U"}</span>
                  <div><b>{connected ? me.nom : "Utilisateur"}</b><small>{me.email || "Identité Microsoft 365 non résolue"}</small></div>
                </div>
                <div className={`connection-state ${connected ? "online" : "offline"}`}><i />{connected ? "Connexion Microsoft 365 active" : "Connexion non établie"}</div>
                {connected && <dl className="user-details"><div><dt>Profil</dt><dd>{UPROF[profile]}</dd></div>{me.dept && <div><dt>Département</dt><dd>{deptName(me.dept)}</dd></div>}</dl>}
                <div className="user-popover-actions">
                  {connected ? <button type="button" className="menu-action danger" onClick={disconnect}>Se déconnecter</button> : <button type="button" className="menu-action" onClick={() => window.location.reload()}>Se connecter</button>}
                </div>
              </div>}
            </div>
          </div>
        </div>
        {adminBlocked && <PlaceholderPage title="Réservé à l'administrateur fonctionnel" />}
        {!adminBlocked && (
          <>
            {screen === "actions" && <ActionsPage onOpenJalon={openJalon} />}
            {screen === "dash" && <DashboardPage onOpenInitiative={openInitiative} />}
            {screen === "portefeuille" && <PortfolioPage onOpenInitiative={openInitiative} onEditInitiative={editInitiative} />}
            {screen === "planning" && <PlanningPage onOpenJalon={openJalon} />}
            {screen === "creer" && editedInitiative && (
              <CreatePage
                key={editedInitiative.code}
                initiative={editedInitiative}
                onCancel={() => navigate("portefeuille")}
                onSubmit={(patch) => {
                  const { bv, ...rest } = patch;
                  if (bv !== undefined) requestBudgetChange(editedInitiative, bv);
                  if (Object.keys(rest).length) requestInitiativeEdit(editedInitiative, rest);
                  navigate("portefeuille");
                }}
              />
            )}
            {screen === "creer" && !editedInitiative && <CreatePage onCreated={() => navigate("planning")} />}
            {screen === "auto" && <AutoPage />}
            {screen === "justifs" && <JustifsPage onOpenJalon={openJalon} />}
            {screen === "strat" && <StratPage />}
            {screen === "dept" && <DeptPage onOpenJalon={openJalon} onOpenInitiative={openInitiative} />}
            {screen === "recos" && <RecosPage onOpenInitiative={openInitiative} />}
            {screen === "bens" && <BensPage onOpenInitiative={openInitiative} />}
            {screen === "budgets" && <BudgetsPage onOpenInitiative={openInitiative} />}
            {screen === "valid" && <ValidPage />}
            {screen === "orga" && <OrgaPage />}
            {screen === "rights" && <RightsPage />}
            {screen === "types" && <TypesPage />}
            {screen === "imports" && <ImportsPage />}
            {screen === "settings" && <SettingsPage />}
          </>
        )}
      </main>
      <JalonDrawer jalonId={openJalonId} onClose={() => setOpenJalonId(null)} />
      <StepsDrawer code={openStepsCode} onEdit={editInitiative} onClose={() => setOpenStepsCode(null)} />
      {notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} />}
      <Toast />
    </div>
  );
}
