import type { Departement, Pilier, Programme, UserProfile, Utilisateur } from "./types";
import { hasRole } from "../lib/roles";

// Les références sont chargées depuis SharePoint au démarrage. Elles restent vides
// tant que la source distante n'a pas répondu : aucune donnée de démonstration n'est utilisée.
export const PILIERS: Pilier[] = [];
export const PROGS: Programme[] = [];
export const DEPTS: Departement[] = [];
export const USERS: Utilisateur[] = [];
export const DIRECTIONS: string[] = [];
export const ORIGINES_DOSSIER = ["Plan stratégique", "Comité de direction", "Demande client", "Réglementation / conformité", "Audit / contrôle", "Veille / benchmark", "Autre"];
// Référentiel volontairement centralisé : il pourra être alimenté depuis SharePoint sans modifier les formulaires.
export const AXES_BSC = ["Axe Financier", "Clients et expérience client", "Processus internes", "Capital humain et apprentissage", "Innovation et transformation digitale", "Risques, conformité et gouvernance"];
export const TYPES_VEILLE = ["Forum", "Foire / salon", "Conférence", "Benchmark", "Autre"];
export const NATURES_GOUVERNANCE = ["Procédure", "Charte de gouvernance", "Politique", "Note d'organisation", "Autre"];

export const SETTING_CATALOGS = {
  origines_dossier: ORIGINES_DOSSIER,
  axes_bsc: AXES_BSC,
  types_veille: TYPES_VEILLE,
  natures_gouvernance: NATURES_GOUVERNANCE,
} as const;
export type SettingCategory = keyof typeof SETTING_CATALOGS;
/** Association Direction → utilisateur directeur, alimentée par 23_Directions. */
export const DIRECTION_DIRECTORS: Record<string, string> = {};

export const UPROF: Record<UserProfile, string> = {
  contrib: "Contributeur",
  gest: "Gestionnaire du portefeuille",
  chef: "Chef de département",
  dir: "Directeur",
  admin: "Administrateur fonctionnel",
};

export const userOf = (id?: string): Utilisateur | undefined => USERS.find((u) => u.id === id);
export const deptById = (id?: string): Departement | undefined => DEPTS.find((x) => x.id === id);
export const deptName = (id?: string): string => deptById(id)?.lib || "Sans département";
export const pilOf = (pilId?: string): Pilier | undefined => PILIERS.find((p) => p.id === pilId);
export const progOf = (progId?: string): Programme | undefined => PROGS.find((p) => p.id === progId);
export const refLbl = (p?: { code: string; lib: string }): string => (p ? `${p.code} – ${p.lib}` : "Non renseigné");
export const chefOf = (deptId?: string): Utilisateur | undefined => USERS.find((u) => u.dept === deptId && hasRole(u, "chef"));
export const directorOf = (direction?: string): Utilisateur | undefined => {
  const id = DIRECTION_DIRECTORS[(direction || "").trim()];
  return id ? USERS.find((u) => u.id === id) : undefined;
};
export const responsableOf = (id?: string): Utilisateur | undefined => USERS.find((u) => u.id === id);

export const ROLES: Record<UserProfile, string> = UPROF;
export const SHORT: Record<UserProfile, string> = {
  contrib: "Contributeur",
  gest: "Gestionnaire",
  chef: "Chef de dépt.",
  dir: "Directeur",
  admin: "Administrateur",
};

let uSeq = 20;
let dSeq = 20;
let plSeq = PILIERS.length;
let pgSeq = PROGS.length;
let refSeq = 20;
export const nextUserId = (): string => "U" + ++uSeq;
export const nextDeptId = (): string => "D" + ++dSeq;
export const nextPilierCode = (): string => "Pilier " + ++plSeq;
export const nextProgCode = (): string => "P" + ++pgSeq;
export const nextRefId = (prefix: "PL" | "PG"): string => prefix + ++refSeq;
