export type JalonStatut = "valide" | "a_valider" | "en_retard" | "a_venir" | "complement";

export interface FichierJoint {
  n: string;
  s: string;
  at: string;
  ok: boolean;
  /** Lien direct vers le fichier stocké dans SharePoint, fourni par la liste Documents. */
  url?: string;
  /** Identifiant de la ValidationRequest en cours si la suppression de ce document a été demandée. */
  pendDel?: string;
}

export interface Note {
  at: string;
  txt: string;
}

export interface Jalon {
  id: string;
  t: string;
  due: string;
  st: JalonStatut;
  fin?: string;
  req: string;
  charte?: boolean;
  f: FichierJoint[];
  coms: Note[];
  difs: Note[];
  /** Phase du portefeuille (0-3) couverte par ce jalon ; voir PHASES dans templates.ts. */
  phase?: number;
  /** Durée en jours ouvrés, utilisée pour la replanification (calculée paresseusement). */
  dur?: number;
  /** Échéance d'origine, affichée barrée pendant qu'un brouillon de replanification est actif. */
  _old?: string;
  /** Vrai si ce jalon provient d'une replanification approuvée (affichage du tag « Nouveau »). */
  isNew?: boolean;
}

export type InitiativeType = string;
export const BUILT_IN_TYPES = ["projet", "produit", "etude", "veille", "maintenance", "gouvernance"] as const;

export interface Benefice {
  id: string;
  lib: string;
  dep: string;
  cib: string;
  unit: string;
  dmes: string;
  val?: string;
  res?: string;
  mesAt?: string;
  pendDel?: string;
}

export interface Recommandation {
  id: string;
  at: string;
  txt: string;
  resp: string;
  ech: string;
  st: "a_lancer" | "en_cours" | "realisee" | "abandonnee";
  obj?: string;
  dep?: string;
  cib?: string;
  unit?: string;
  val?: string;
  res?: string;
  suivi: { at: string; txt: string; auto?: boolean }[];
  f: FichierJoint[];
  /** Vrai pendant qu'une demande d'abandon est en attente du Chef de département. */
  abandonPend?: boolean;
}

export interface Initiative {
  code: string;
  type: InitiativeType;
  it?: boolean;
  terrain?: boolean;
  titre: string;
  porteur: string;
  porteurId?: string;
  dept?: string;
  metier?: string;
  benef?: string;
  resIT?: string;
  phase: number;
  pil?: string;
  prog?: string;
  jalons: Jalon[];
  bens?: Benefice[];
  recos?: Recommandation[];
  bv?: string;
  bc?: string;
  charteAt?: string;
  susp?: { at: string; motif: string };
  vtype?: string;
  desc?: string;
  deb?: string;
  vfin?: string;
  participants?: string;
  gnat?: string;
  /** Brouillon de replanification en cours (glisser-déposer, ajout de jalon). */
  plan?: PlanDraft;
  /** Date de démarrage, back-calculée depuis le premier jalon si absente (ensureDurs). */
  start?: string;
  /** Historique des mises à jour du budget consommé, la plus récente en tête. */
  bcHist?: BudgetUpdate[];
  /** Nouveau budget validé en attente de décision du Directeur. */
  bvPend?: string;
  /** Nouveau rattachement (pilier/programme) en attente de décision du Chef de département. */
  ratPend?: { pil: string; prog: string };
  /** Vrai pendant qu'une demande de suspension ou de reprise est en attente du Directeur. */
  suspPend?: boolean;
  /** Renseigné une fois l'abandon approuvé par le Directeur ; l'initiative n'est jamais supprimée, seulement marquée. */
  abandoned?: { at: string; motif: string };
  /** Vrai pendant qu'une demande d'abandon est en attente du Directeur. */
  abandonPend?: boolean;
  origineDossier?: string;
  origineDossierAutre?: string;
  axeBsc?: string;
}

/** Jalon "en vue" dans un brouillon de replanification : peut être réel ou proposé (nouveau). */
export interface PlanItem {
  id: string;
  t: string;
  dur: number;
  due: string;
  req: string;
  isNew?: boolean;
}

export interface PlanDraft {
  items: PlanItem[];
  /** Messages lisibles accumulés, ex. « « X » déplacé en position 3 ». */
  changes: string[];
  /** endOf(i) au moment de l'initialisation du brouillon, pour calculer le décalage. */
  endBefore: string;
  /** Identifiant de la ValidationRequest une fois soumis : verrouille le brouillon. */
  reqId?: string;
}

export interface BudgetUpdate {
  at: string;
  v: string;
  comment?: string;
  file?: FichierJoint;
}

export interface Pilier {
  id: string;
  code: string;
  lib: string;
  responsableId?: string;
}

export interface Programme {
  id: string;
  code: string;
  lib: string;
  responsableId?: string;
}

export interface Departement {
  id: string;
  lib: string;
  dir: string;
}

export type UserProfile = "contrib" | "gest" | "chef" | "dir" | "admin";

export interface Utilisateur {
  id: string;
  nom: string;
  /** Adresse e-mail professionnelle, utilisée pour faire correspondre l'identité Office 365 connectée à cet utilisateur. */
  email?: string;
  dept: string;
  /** Rôles cumulés de l'utilisateur. `prof` reste le rôle effectif le plus élevé. */
  profils?: UserProfile[];
  prof: UserProfile;
}

export interface TemplateStep {
  t: string;
  dur: number;
  durSans?: number;
  req: string;
  charte?: boolean;
  it?: boolean;
  ev?: boolean;
  terrain?: boolean;
  /** Phase du portefeuille (0-3) atteinte pendant cette étape ; voir PHASES. */
  phase?: number;
}

export interface InitiativeTemplate {
  label: string;
  short?: string;
  desc?: string;
  reco?: boolean;
  custom?: boolean;
  active?: boolean;
  steps: TemplateStep[];
}

export interface LogEntry {
  at: string;
  sys: boolean;
  m: string;
  who?: string;
}

export type ValidationKind = "delais" | "budget" | "rattach" | "suspension" | "retrait_ben" | "abandon" | "retrait_doc" | "reco_abandon" | "initiative_edit";

export interface ValidationRequest {
  id: string;
  kind: ValidationKind;
  role: UserProfile;
  code: string;
  label: string;
  lines: string[];
  payload: Record<string, unknown>;
  by: string;
  /** Adresse du demandeur, utilisée pour la notification de décision. */
  byEmail?: string;
  at: string;
  st: "attente" | "approuvee" | "rejetee" | "retiree";
  decAt?: string;
  decBy?: string;
  motif?: string;
}

export interface Notification {
  id: string;
  recipientEmail: string;
  type?: string;
  message: string;
  initiativeCode?: string;
  validationId?: string;
  at: string;
  read: boolean;
  readAt?: string;
  readerEmail?: string;
  link?: string;
}
