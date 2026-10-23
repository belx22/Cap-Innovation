// Jours fériés du Cameroun, à date fixe uniquement.
// Les fêtes mobiles (Vendredi saint, Lundi de Pâques, Ascension, Tabaski/Aïd el-Fitr,
// Aïd el-Adha) varient chaque année et ne sont pas incluses ici : il serait risqué
// d'injecter des dates devinées dans des calculs d'échéances engageantes. À compléter
// par l'administrateur fonctionnel chaque année (calendrier paramétrable, cf. cahier
// des charges II.1.19).
export const HOLIDAYS: string[] = [
  // 2026
  "2026-01-01", // Jour de l'an
  "2026-05-01", // Fête du travail
  "2026-05-20", // Fête nationale
  "2026-08-15", // Assomption
  "2026-12-25", // Noël
  // 2027
  "2027-01-01",
  "2027-05-01",
  "2027-05-20",
  "2027-08-15",
  "2027-12-25",
];
