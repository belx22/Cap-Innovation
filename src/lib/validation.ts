import type { Initiative, UserProfile, ValidationKind, ValidationRequest } from "../data/types";
import { ROLES, chefOf, deptName } from "../data/reference";

export { ROLES };

export const VRULES: Record<ValidationKind, { role: UserProfile; lbl: string; ex: string }> = {
  delais: { role: "chef", lbl: "Modification des délais arrêtés", ex: "Ajout d'un jalon, déplacement d'un jalon, changement de durée après création" },
  budget: { role: "dir", lbl: "Modification du budget validé", ex: "Hausse ou baisse du budget validé d'une initiative" },
  rattach: { role: "chef", lbl: "Changement de rattachement stratégique", ex: "Pilier ou programme stratégique d'une initiative" },
  suspension: { role: "dir", lbl: "Suspension ou reprise d'une initiative", ex: "Mise en pause d'une initiative (relances arrêtées) ou reprise" },
  retrait_ben: { role: "chef", lbl: "Retrait d'un bénéfice attendu", ex: "Suppression d'un bénéfice défini sur un projet ou un produit" },
  abandon: { role: "dir", lbl: "Abandon d'une initiative", ex: "Arrêt définitif d'une initiative, conservée mais marquée abandonnée" },
  retrait_doc: { role: "chef", lbl: "Suppression d'un justificatif déposé", ex: "Retrait d'une pièce déjà déposée sur une étape" },
  reco_abandon: { role: "chef", lbl: "Abandon d'une recommandation", ex: "Arrêt d'une recommandation issue d'une étude ou d'une veille" },
  initiative_edit: { role: "chef", lbl: "Modification des attributs de l'initiative", ex: "Modification des attributs métier d'une initiative existante" },
};

export const CIRCUIT: [string, string, string][] = [
  ["Report d'échéance, changement de durée ou déplacement d'un jalon décalant la fin de 30 jours ou moins", "Chef de département", "Directeur"],
  ["Décalage de la fin de l'initiative de plus de 30 jours", "Directeur", "—"],
  ["Ajout ou suppression d'un jalon", "Chef de département", "Directeur"],
  ["Modification du budget validé (hausse ou baisse)", "Directeur", "—"],
  ["Abandon d'une initiative", "Directeur", "—"],
  ["Suspension ou reprise d'une initiative", "Directeur", "—"],
  ["Changement d'un acteur (porteur, responsable métier, IT, bénéfices)", "Chef de département", "Directeur"],
  ["Changement du pilier ou du programme stratégique d'une initiative", "Chef de département", "Directeur"],
  ["Suppression d'un justificatif déposé", "Chef de département", "Directeur"],
  ["Modification de la cible ou retrait d'un bénéfice attendu", "Chef de département", "Directeur"],
  ["Abandon d'une recommandation", "Chef de département", "Directeur"],
  ["Clôture d'une veille sans recommandation", "Chef de département", "Directeur"],
  ["Modification des attributs d'une initiative", "Chef de département", "Directeur"],
];

export function validatorName(r: ValidationRequest, innos: Initiative[]): string {
  const i = innos.find((x) => x.code === r.code);
  if (r.role === "chef" && i) {
    const c = chefOf(i.dept);
    return `${ROLES.chef}${c ? ` (${c.nom}, ${deptName(i.dept)})` : ` (${deptName(i.dept)})`}`;
  }
  return ROLES[r.role];
}

/** `scopeDept` vient de `useStore()` : le périmètre département effectif de l'utilisateur (null = aucune restriction). */
export const isMine = (r: ValidationRequest, profile: UserProfile, innos: Initiative[], scopeDept: string | null): boolean =>
  r.st === "attente" &&
  r.role === profile &&
  (!scopeDept || innos.find((x) => x.code === r.code)?.dept === scopeDept);
