# Cap Innovation — frontend React

Portage en React + TypeScript (Vite) du prototype HTML `cap-innovation-interfaces.html`
(gestion du portefeuille d'innovation GFA), conçu pour être publié comme **Power Apps
code app**.

## Périmètre de cette version

Les 15 écrans du prototype sont portés :

- **Mes actions** — file d'actions (étapes à clôturer / justificatifs à déposer /
  bénéfices à mesurer), tiroir de clôture d'un jalon (dépôt de pièce, date de fin,
  demande de complément, commentaires et difficultés), flux d'activité, difficultés
  remontées.
- **Dashboard** — indicateurs de performance, délais, rythme d'exécution, statuts et
  suspens, valeur attendue/produite, solutions livrées, performance par département et
  par porteur, répartition par type et par pilier.
- **Portefeuille** — vues Kanban / Liste / Cartes, regroupement et tri, filtres (type,
  phase, département, porteur, pilier).
- **Départements** — tableau de bord par département (activités, instances, résultats,
  membres), avec sélecteur de département ou verrouillage automatique sur « Mon
  département » pour le profil Chef de département.
- **Planning** — diagramme de Gantt des jalons, ouverture d'un jalon ou d'une
  initiative.
- **Justificatifs** — pièces à déposer et pièces déposées, avec leur contrôle.
- **Recommandations** — suivi de mise en œuvre des recommandations d'études et de
  veilles (statut, responsable, échéance, objectif chiffré, suivi, pièces).
- **Bénéfices** — bénéfices attendus des projets/produits et recommandations des
  études/veilles au même endroit, mesure à la clôture, demande de retrait soumise à
  validation.
- **Budgets et valeur** — consommation vs avancement, alertes de dépassement, demande
  de modification du budget validé soumise à validation (profil Directeur).
- **Validations** — circuit d'approbation (demandes de modification de budget et de
  retrait de bénéfice), file « à valider par vous » selon le profil connecté,
  historique, règles de validation.
- **Piliers et programmes** — référentiel stratégique en lecture/écriture (Chef de
  département, Directeur, Administrateur), création/modification/suppression protégée
  si encore utilisé.
- **Automatisations** — règles actives et journal filtrable.
- **Départements et utilisateurs** *(Administrateur)* — CRUD des départements et des
  utilisateurs.
- **Types d'initiative** *(Administrateur)* — conception de nouveaux types
  d'initiative (étapes, durées, justificatifs, bénéfices ou recommandations) ;
  apparaissent immédiatement dans « Créer une initiative ».
- **Créer une initiative** — assistant de création (types intégrés et types conçus par
  l'administrateur, planning prévisionnel en jours ouvrés recalculé en continu,
  bénéfices attendus, pièces jointes), génération des jalons et rattachement
  automatique au département du porteur.

Le sélecteur **« Profil connecté »** (dans le menu) change réellement le comportement
de l'application : visibilité des écrans d'administration, file « à valider par vous »
dans Validations, verrouillage sur « Mon département ».

### Simplifications assumées

- Données en mémoire (`src/data/seed.ts` + référentiels dans `src/data/reference.ts`),
  identiques au prototype, sans backend — voir « Brancher des données réelles » plus
  bas.
- Pas de pagination (le jeu de données de démonstration est petit) et pas de
  persistance au rechargement de page (état réinitialisé).
- Circuit de validation implémenté pour deux déclencheurs concrets (modification du
  budget validé, retrait d'un bénéfice attendu) ; les autres catégories du prototype
  (délais, rattachement stratégique, suspension d'initiative) figurent dans le tableau
  des règles mais ne sont pas encore reliées à une action de l'interface — ce sont des
  actions qui, dans le prototype, se faisaient depuis le tiroir « Étapes et documents »
  d'une initiative, non reconstruit tel quel ici.
- Le dépôt de pièce simule un contrôle automatique (délai de ~1,4 s) comme dans le
  prototype, mais il n'y a pas de vrai stockage de fichier.

## Démarrer en local

```bash
npm install
npm run dev
```

Puis ouvrez l'URL indiquée par Vite (par défaut http://localhost:5173).

```bash
npm run build     # build de production (tsc -b && vite build)
npm run preview   # sert le build de production en local
```

## Architecture

```
src/
  data/        types.ts, templates.ts (modèles d'étapes par type d'initiative,
               y compris les types conçus par l'administrateur),
               reference.ts (piliers, programmes, départements, utilisateurs —
               mutables, modifiés par les écrans d'administration),
               seed.ts (jeu de données de démonstration)
  lib/         dates.ts (jours ouvrés, formats), domain.ts (statuts, santé,
               avancement, indicateurs), schedule.ts (générateur de planning
               prévisionnel), validation.ts (circuit de validation : rôles,
               règles, résolution du validateur)
  state/       store.tsx — Context + reducer React : seule porte d'entrée pour
               modifier les initiatives, le profil connecté et les demandes de
               validation
  components/  Sidebar, JalonDrawer (tiroir de jalon), InitiativeCard, Meter,
               HBars, Toast
  pages/       ActionsPage, DashboardPage, PortfolioPage, PlanningPage,
               CreatePage, DeptPage, JustifsPage, RecosPage, BensPage,
               BudgetsPage, ValidPage, StratPage, AutoPage, OrgaPage,
               TypesPage, PlaceholderPage (écran « accès restreint »)
  styles/      global.css — feuille de style portée du prototype (variables
               CSS, thème sombre automatique via prefers-color-scheme),
               recolorée aux couleurs de la banque (gris / noir / rouge / blanc)
```

## Brancher des données réelles (Dataverse ou autre connecteur)

Le premier lot utilise des données en mémoire pour avancer vite. Pour brancher une
vraie source de données plus tard, sans réécrire les écrans :

1. Garder les mêmes formes de données (`src/data/types.ts`).
2. Remplacer la source dans `src/state/store.tsx` (actuellement
   `useReducer(reducer, { innos: INNOS_SEED, log: LOG_SEED })`) par un chargement
   depuis Dataverse (ou un connecteur Power Platform) via le SDK généré par
   `pac code add-data-source` (voir plus bas).
3. Les fonctions de `src/lib/domain.ts` sont pures (elles ne dépendent pas de la
   source des données) : elles continueront à fonctionner sans modification.

## Publier comme Power Apps code app

Les **Power Apps code apps** permettent de publier une application React/TypeScript
standard (Vite) dans Power Apps via le CLI Power Platform (`pac`), avec option de
connexion à Dataverse ou aux connecteurs Power Platform. C'est une fonctionnalité qui
évolue encore (preview) : vérifiez `pac code --help` et la documentation Microsoft à
jour avant de lancer les commandes, les noms d'options peuvent changer d'une version du
CLI à l'autre.

**Prérequis**

- [Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction)
  installé (`pac`), à jour (`pac install latest`).
- Un environnement Power Platform avec Dataverse, sur lequel la fonctionnalité
  « code apps » est activée (à vérifier dans le Centre d'administration Power
  Platform si `pac code init` échoue en indiquant que la fonctionnalité n'est pas
  disponible).
- Node.js (déjà nécessaire pour ce projet).

**Étapes**

```bash
# 1. Authentifier le CLI sur l'environnement cible
pac auth create --environment <ID-ou-URL-de-l-environnement>

# 2. Depuis la racine de ce projet (cap-innovation-app) : initialiser le projet
#    comme code app. Cette commande ajoute les fichiers propres à Power Apps
#    (power.config.json, PowerProvider, etc.) à ce projet Vite existant.
pac code init

# 3. (Optionnel, à faire plus tard) Brancher une table Dataverse ou un connecteur :
pac code add-data-source -a dataverse -t <nom_de_table>
#    Adapte ensuite src/state/store.tsx pour lire/écrire via le code généré.

# 4. Construire le projet
npm install
npm run build

# 5. Publier le build dans l'environnement Power Platform
pac code push
```

Une fois `pac code push` terminé, l'application apparaît dans
[make.powerapps.com](https://make.powerapps.com) parmi les applications de
l'environnement : partagez-la avec les utilisateurs ou groupes de sécurité comme
n'importe quelle autre Power App.

**Pour itérer** : modifiez le code, relancez `npm run build` puis `pac code push`
pour republier une nouvelle version sur le même app id.
