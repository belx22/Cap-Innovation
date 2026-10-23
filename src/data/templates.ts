import type { InitiativeTemplate, InitiativeType } from "./types";

export const PHASES = ["Idée", "Étude", "Pilote", "Déploiement", "Généralisée"];

export const LBL: Record<string, string> = {
  valide: "Clôturée",
  a_valider: "À valider",
  en_retard: "En retard",
  a_venir: "À venir",
  complement: "Complément demandé",
};

export type TemplateKey = InitiativeType | "projet_it";

export const TEMPLATES: Record<TemplateKey, InitiativeTemplate> = {
  maintenance: {
    label: "Maintenance",
    steps: [
      { t: "Réception du besoin", dur: 2, req: "Expression du besoin", phase: 0 },
      { t: "Analyse du besoin", dur: 5, req: "Fiche d'analyse", phase: 1 },
      { t: "Implémentation", dur: 10, req: "Note de livraison", phase: 2 },
      { t: "Tests avec le métier", dur: 5, req: "PV de tests métier", phase: 2 },
      { t: "Mise en production", dur: 2, req: "PV de mise en production", phase: 3 },
      { t: "Suivi des bénéfices", dur: 20, req: "Rapport de suivi des bénéfices", phase: 3 },
    ],
  },
  gouvernance: {
    label: "Cadrage & Gouvernance",
    short: "Cadrage & gouvernance",
    steps: [
      { t: "Cadrage du besoin", dur: 5, req: "Note de cadrage", phase: 0 },
      { t: "Diagnostic de l'existant", dur: 10, req: "Rapport de diagnostic", phase: 1 },
      { t: "Rédaction du document", dur: 15, req: "Projet de procédure ou de charte", phase: 2 },
      { t: "Consultation des parties prenantes", dur: 10, req: "Avis consolidés", phase: 2 },
      { t: "Validation et approbation", dur: 10, req: "Document approuvé et signé", phase: 2 },
      { t: "Diffusion et accompagnement", dur: 10, req: "Note de diffusion et supports", phase: 3 },
      { t: "Suivi de l'application", dur: 20, req: "Bilan d'application", phase: 3 },
    ],
  },
  veille: {
    label: "Veille",
    steps: [
      { t: "Participation à l'événement", dur: 3, req: "Attestation de participation", ev: true },
      { t: "Compte rendu et recommandations", dur: 5, req: "Compte rendu de veille" },
    ],
  },
  etude: {
    label: "Étude",
    steps: [
      { t: "Idée d'étude", dur: 5, req: "Fiche idée d'étude" },
      { t: "Protocole d'étude", dur: 5, req: "Protocole d'étude validé" },
      { t: "Rapport d'étude", dur: 20, durSans: 10, terrain: true, req: "Rapport d'étude" },
    ],
  },
  projet: {
    label: "Projet",
    steps: [
      { t: "Fiche idée de projet", dur: 10, req: "Fiche idée validée par le comité", phase: 0 },
      { t: "Étude d'opportunité et analyse des options", dur: 20, req: "Étude d'opportunité", phase: 1 },
      { t: "Charte de projet et budget", dur: 15, req: "Charte de projet signée", charte: true, phase: 2 },
      { t: "Réalisation", dur: 60, req: "PV de livraison", phase: 2 },
      { t: "Recette", dur: 15, req: "PV de recette", phase: 2 },
      { t: "Déploiement", dur: 20, req: "Rapport de déploiement", phase: 3 },
      { t: "Clôture et bilan", dur: 10, req: "Bilan de clôture", phase: 3 },
    ],
  },
  projet_it: {
    label: "Projet IT",
    steps: [
      { t: "Fiche idée de projet", dur: 10, req: "Fiche idée validée par le comité", phase: 0 },
      { t: "Étude d'opportunité et analyse des options", dur: 20, req: "Étude d'opportunité", phase: 1 },
      { t: "Charte de projet et budget", dur: 15, req: "Charte de projet signée", charte: true, phase: 2 },
      { t: "Spécifications fonctionnelles et techniques", dur: 15, req: "Spécifications validées", it: true, phase: 2 },
      { t: "Développement et intégration", dur: 60, req: "PV de livraison", phase: 2 },
      { t: "Tests QA", dur: 15, req: "Rapport de tests QA", it: true, phase: 2 },
      { t: "Recette métier", dur: 10, req: "PV de recette", phase: 2 },
      { t: "Mise en production", dur: 5, req: "PV de mise en production", it: true, phase: 3 },
      { t: "Déploiement", dur: 20, req: "Rapport de déploiement", phase: 3 },
      { t: "Clôture et bilan", dur: 10, req: "Bilan de clôture", phase: 3 },
    ],
  },
  produit: {
    label: "Produit",
    steps: [
      { t: "Fiche idée produit", dur: 10, req: "Fiche idée produit", phase: 0 },
      { t: "Étude de marché et business case", dur: 20, req: "Business case", phase: 1 },
      { t: "Conception de l'offre et tarification", dur: 20, req: "Fiche produit et grille tarifaire", phase: 2 },
      { t: "Avis conformité, juridique et risques", dur: 15, req: "Avis du comité produits", phase: 2 },
      { t: "Paramétrage SI et tests", dur: 30, req: "PV de recette", phase: 2 },
      { t: "Formation du réseau et supports commerciaux", dur: 15, req: "Supports de formation", phase: 3 },
      { t: "Lancement commercial", dur: 10, req: "Plan de lancement", phase: 3 },
      { t: "Revue post-lancement à 3 mois", dur: 65, req: "Bilan à 3 mois", phase: 3 },
    ],
  },
};

export const TYPES: [InitiativeType | "projet_it", string][] = [
  ["projet", "Projet"],
  ["projet_it", "Projet IT"],
  ["produit", "Produit"],
  ["maintenance", "Maintenance"],
  ["gouvernance", "Cadrage & gouvernance"],
  ["etude", "Étude"],
  ["veille", "Veille"],
];

export const BUILT_IN_KEYS = ["projet", "projet_it", "produit", "maintenance", "gouvernance", "etude", "veille"];

let tSeq = 0;
export const nextCustomTypeKey = (): string => "t" + ++tSeq;

export const tDur = (steps: { dur: number }[]): number => steps.reduce((a, x) => a + (Math.max(0, x.dur) || 0), 0);
export const durTxt = (n: number): string =>
  `${n} j. ouvrés (${n <= 60 ? (Math.round((n / 5) * 10) / 10).toLocaleString("fr-FR") + " sem." : (Math.round((n / 21) * 10) / 10).toLocaleString("fr-FR") + " mois"})`;
