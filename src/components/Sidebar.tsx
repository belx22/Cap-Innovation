import { useMemo } from "react";
import type { Screen } from "../App";
import { useStore } from "../state/store";
import { recoLate, normRecos, isReco, normBens, benState, budAlert } from "../lib/domain";
import { isMine } from "../lib/validation";
interface NavItem {
  screen: Screen;
  label: string;
  badge?: number;
}

export default function Sidebar({
  screen,
  onNavigate,
  actionsCount,
  autoRate,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  actionsCount: number;
  autoRate: string;
}) {
  const { scopedInnos: innos, vals, profile, scopeDept } = useStore();

  const recoLateCount = useMemo(
    () => innos.filter(isReco).reduce((a, i) => a + normRecos(i).filter(recoLate).length, 0),
    [innos]
  );
  const benToMeasureCount = useMemo(
    () =>
      innos
        .filter((i) => !isReco(i))
        .reduce((a, i) => a + normBens(i).filter((b) => benState(i, b) === "amesurer").length, 0),
    [innos]
  );
  const budOverCount = useMemo(() => innos.filter((i) => budAlert(i)?.[0] === "Dépassement").length, [innos]);
  const valMineCount = useMemo(() => vals.filter((r) => isMine(r, profile, innos, scopeDept)).length, [vals, profile, innos, scopeDept]);
  const isScoped = profile === "chef" || profile === "contrib";
  const deptLabel = isScoped ? "Mon département" : "Départements";

  const items: NavItem[] = [
    { screen: "actions", label: "Mes actions", badge: actionsCount },
    { screen: "dash", label: "Dashboard" },
    { screen: "portefeuille", label: "Portefeuille" },
    { screen: "dept", label: deptLabel },
    { screen: "planning", label: "Planning" },
    { screen: "justifs", label: "Justificatifs" },
    { screen: "recos", label: "Recommandations", badge: recoLateCount },
    { screen: "bens", label: "Bénéfices", badge: benToMeasureCount },
    { screen: "budgets", label: "Budgets et valeur", badge: budOverCount },
    { screen: "valid", label: "Validations", badge: valMineCount },
    { screen: "strat", label: "Piliers et programmes" },
    { screen: "auto", label: "Automatisations" },
  ];

  const adminItems: NavItem[] = [
    { screen: "settings", label: "Paramètres" },
    { screen: "types", label: "Types d'initiative" },
    { screen: "orga", label: "Départements et utilisateurs" },
    { screen: "rights", label: "Droits et profils" },
    { screen: "imports", label: "Modèles d'import SharePoint" },
  ];

  return (
    <aside className="side">
      <div className="brand">
        <b>Cap Innovation</b>
        <span>Portefeuille DEI</span>
      </div>
      <nav aria-label="Écrans">
        <button type="button" className="nav new" onClick={() => onNavigate("creer")}>
          + Nouvelle initiative
        </button>
        <span className="nav-section">ESPACE DE TRAVAIL</span>
        {items.map((it) => (
          <button
            key={it.screen}
            type="button"
            className="nav"
            aria-current={screen === it.screen ? "page" : undefined}
            onClick={() => onNavigate(it.screen)}
          >
            {it.label}
            {!!it.badge && <span className="badge">{it.badge}</span>}
          </button>
        ))}
        {profile === "admin" && <span className="nav-section">RÉFÉRENTIELS & ADMINISTRATION</span>}
        {profile === "admin" &&
          adminItems.map((it) => (
            <button
              key={it.screen}
              type="button"
              className="nav adm"
              aria-current={screen === it.screen ? "page" : undefined}
              onClick={() => onNavigate(it.screen)}
            >
              {it.label}
            </button>
          ))}
      </nav>
      <div className="side-foot">
        <span>Étapes traitées sans intervention cette semaine</span>
        <b>{autoRate}</b>
      </div>
    </aside>
  );
}
