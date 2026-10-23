export interface ImportModel {
  file: string;
  title: string;
  description: string;
  headers: string[];
}

const RAW_MODELS: [string, string, string, string[]][] = [
  ["23_Directions.csv", "Directions", "Référentiel des directions utilisé par les départements.", ["Title", "Id", "Libelle", "Actif"]],
  ["01_Departements.csv", "Départements", "Départements, directions et chef Microsoft 365.", ["Title", "Id", "Libelle", "Direction", "ChefEmail", "Actif"]],
  ["02_Utilisateurs.csv", "Utilisateurs", "Utilisateurs, e-mail, profil et département.", ["Title", "Id", "Nom", "Email", "DepartementId", "Profil", "Actif"]],
  ["03_Piliers.csv", "Piliers", "Référentiel des piliers stratégiques et de leurs responsables.", ["Title", "Id", "Code", "Libelle", "Actif", "ResponsableId"]],
  ["04_Programmes.csv", "Programmes", "Référentiel des programmes stratégiques et de leurs responsables.", ["Title", "Id", "Code", "Libelle", "Actif", "ResponsableId"]],
  ["05_TypesInitiative.csv", "Types d'initiative", "Types utilisés par l'assistant de création.", ["Title", "TypeKey", "Libelle", "Description", "ResultatSuivi", "Actif", "Personnalise"]],
  ["06_EtapesTypesInitiative.csv", "Étapes des types", "Modèles de jalons et justificatifs.", ["Title", "TypeKey", "Ordre", "Libelle", "DureeJoursOuvres", "Justificatif", "Phase", "Charte", "IT", "Terrain"]],
  ["07_Initiatives.csv", "Initiatives", "Portefeuille principal.", ["Title", "Code", "TypeKey", "Titre", "PorteurId", "DepartementId", "IT", "Terrain", "TypeVeille", "ResponsableMetier", "ResponsableBenefice", "ResponsableIT", "Participants", "ObjetGouvernance", "Phase", "PilierId", "ProgrammeId", "BudgetValide", "BudgetConsomme", "BudgetEnAttente", "DateDebut", "DateFin", "Description", "CharteDate", "Statut", "SuspensionEnAttente", "RattachementEnAttente", "AbandonEnAttente", "Abandonnee", "OrigineDossier", "OrigineDossierAutre", "AxeBSC"]],
  ["08_Jalons.csv", "Jalons", "Étapes d'exécution des initiatives.", ["Title", "Id", "InitiativeCode", "Ordre", "Libelle", "Echeance", "Statut", "DateFin", "JustificatifAttendu", "Phase", "DureeJoursOuvres", "AncienneEcheance", "Charte", "EstNouveau"]],
  ["09_Benefices.csv", "Bénéfices", "Bénéfices attendus et mesures.", ["Title", "Id", "InitiativeCode", "Libelle", "ValeurDepart", "ValeurCible", "Unite", "DateMesure", "ValeurAtteinte", "Resultat", "Statut", "SuppressionEnAttente"]],
  ["10_Recommandations.csv", "Recommandations", "Recommandations issues des études et veilles.", ["Title", "Id", "InitiativeCode", "DateCreation", "Texte", "Responsable", "Echeance", "Statut", "Objectif", "ValeurDepart", "ValeurCible", "Unite", "ValeurAtteinte", "Resultat", "AbandonEnAttente"]],
  ["11_SuivisRecommandations.csv", "Suivis de recommandations", "Points de suivi des recommandations.", ["Title", "Id", "RecommandationId", "DateSuivi", "Texte", "Automatique"]],
  ["12_Validations.csv", "Validations", "Demandes d'approbation.", ["Title", "Id", "TypeValidation", "ProfilValidateur", "InitiativeCode", "Libelle", "Demandeur", "DateDemande", "Statut", "DateDecision", "Decideur", "Motif", "PayloadJson"]],
  ["13_Documents.csv", "Documents métier", "Métadonnées des justificatifs et documents.", ["Title", "Id", "InitiativeCode", "JalonId", "RecommandationId", "NomFichier", "Taille", "DateDepot", "ControleOK", "SuppressionEnAttente"]],
  ["14_HistoriqueBudgets.csv", "Historique des budgets", "Évolution du budget consommé.", ["Title", "Id", "InitiativeCode", "DateMiseAJour", "Montant", "Commentaire", "DocumentId"]],
  ["15_JalonCommentaires.csv", "Commentaires de jalons", "Commentaires laissés sur les étapes.", ["Title", "Id", "JalonId", "InitiativeCode", "DateCommentaire", "Texte", "AuteurEmail"]],
  ["16_JalonDifficultes.csv", "Difficultés de jalons", "Difficultés et blocages signalés.", ["Title", "Id", "JalonId", "InitiativeCode", "DateSignalement", "Texte", "AuteurEmail", "Statut"]],
  ["17_Replanifications.csv", "Replanifications", "Brouillons et demandes de replanification.", ["Title", "Id", "InitiativeCode", "ValidationId", "FinAvant", "Changements", "Statut"]],
  ["18_ReplanificationItems.csv", "Éléments de replanification", "Jalons proposés dans une replanification.", ["Title", "Id", "InitiativeCode", "ValidationId", "Ordre", "Libelle", "DureeJoursOuvres", "Echeance", "Justificatif", "EstNouveau"]],
  ["19_JournalActivite.csv", "Journal d'activité", "Traçabilité des actions.", ["Title", "Id", "DateAction", "EstSysteme", "Message", "AuteurEmail", "InitiativeCode"]],
  ["20_LignesValidation.csv", "Lignes de validation", "Détail des demandes de validation.", ["Title", "Id", "ValidationId", "Ordre", "Texte"]],
  ["21_JoursFeries.csv", "Jours fériés", "Calendrier utilisé pour les jours ouvrés.", ["Title", "Id", "Date", "Libelle", "Actif"]],
  ["22_Notifications.csv", "Notifications", "Notifications adressées aux utilisateurs et suivi de leur lecture.", ["Title", "Id", "DestinataireEmail", "Type", "Message", "InitiativeCode", "ValidationId", "DateNotification", "Lu", "DateLecture", "LecteurEmail", "Lien"]],
];

export const IMPORT_MODELS: ImportModel[] = RAW_MODELS.map(([file, title, description, headers]) => ({ file, title, description, headers }));

export function downloadImportModel(model: ImportModel) {
  const blob = new Blob(["\uFEFF" + model.headers.join(",") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = model.file;
  a.click();
  URL.revokeObjectURL(url);
}
