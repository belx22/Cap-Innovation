import { _01_DepartementsService } from "../generated/services/_01_DepartementsService";
import { _02_UtilisateursService } from "../generated/services/_02_UtilisateursService";
import { rolesToSharePoint } from "./roles";
import { _03_PiliersService } from "../generated/services/_03_PiliersService";
import { _04_ProgrammesService } from "../generated/services/_04_ProgrammesService";
import { _05_TypesInitiativeService } from "../generated/services/_05_TypesInitiativeService";
import { _06_EtapesTypesInitiativeService } from "../generated/services/_06_EtapesTypesInitiativeService";
import { _07_InitiativesService } from "../generated/services/_07_InitiativesService";
import { _08_JalonsService } from "../generated/services/_08_JalonsService";
import { _09_BeneficesService } from "../generated/services/_09_BeneficesService";
import { _10_RecommandationsService } from "../generated/services/_10_RecommandationsService";
import { _11_SuivisRecommandationsService } from "../generated/services/_11_SuivisRecommandationsService";
import { _12_ValidationsService } from "../generated/services/_12_ValidationsService";
import { _13_DocumentsService } from "../generated/services/_13_DocumentsService";
import { _14_HistoriqueBudgetsService } from "../generated/services/_14_HistoriqueBudgetsService";
import { _15_JalonCommentairesService } from "../generated/services/_15_JalonCommentairesService";
import { _16_JalonDifficultesService } from "../generated/services/_16_JalonDifficultesService";
import { _17_ReplanificationsService } from "../generated/services/_17_ReplanificationsService";
import { _18_ReplanificationItemsService } from "../generated/services/_18_ReplanificationItemsService";
import { _19_JournalActiviteService } from "../generated/services/_19_JournalActiviteService";
import { _20_LignesValidationService } from "../generated/services/_20_LignesValidationService";
import { _22_NotificationsService } from "../generated/services/_22_NotificationsService";
import { _23_DirectionsService } from "../generated/services/_23_DirectionsService";
import type { Departement, Initiative, InitiativeTemplate, LogEntry, Notification, Pilier, Programme, Utilisateur, ValidationRequest } from "../data/types";
import type { SettingCategory } from "../data/reference";

type Row = Record<string, any>;
type CrudService = { getAll: () => Promise<any>; create: (record: Row) => Promise<any>; update: (id: string, fields: Row) => Promise<any>; delete: (id: string) => Promise<any> };
type PagedCrudService = CrudService & { getAll: (options?: { top?: number; skipToken?: string }) => Promise<any> };
const b = (v: unknown): boolean => !!v;
const s = (v: unknown): string => String(v ?? "");
const SHAREPOINT_TEXT_LIMIT = 255;
/** Les listes de l'application utilisent des colonnes texte SharePoint limitées à 255 caractères. */
function safeRow(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([field, value]) => [
    field,
    typeof value === "string" ? value.slice(0, SHAREPOINT_TEXT_LIMIT) : value,
  ]));
}
const person = (email?: string, displayName?: string) => (email ? [{
  "@odata.type": "#Microsoft.Azure.Connectors.SharePoint.SPListExpandedUser",
  Claims: `i:0#.f|membership|${email}`,
  DisplayName: displayName || email,
  Email: email,
  Picture: "",
  Department: "",
  JobTitle: "",
}] : []);
const directionKey = (row: Row): string => String(row.field_2 || row.Title || "").trim().toLowerCase();

function fileMeta(file: { url?: string; pendDel?: string }): string {
  const value = { url: file.url || "", pendDel: file.pendDel || "" };
  if (!value.url && !value.pendDel) return "";
  const serialized = JSON.stringify(value);
  // 13_Documents.SuppressionEnAttente est une colonne texte SharePoint
  // limitée à 255 caractères. Une URL complète peut dépasser cette limite
  // avec les chemins d'initiative, de jalon et les noms de fichiers longs.
  // Dans ce cas, sharepointData.ts reconstruit l'URL depuis les autres champs.
  return serialized.length <= 255 ? serialized : value.pendDel || "";
}

async function readAllRows(service: PagedCrudService, label: string): Promise<Row[]> {
  const rows: Row[] = [];
  let skipToken: string | undefined;
  let page = 0;
  const maxPages = 50;
  do {
    let response = await service.getAll(skipToken ? { top: 5000, skipToken } : { top: 5000 });
    // Certains connecteurs SharePoint refusent la requête paginée sur une
    // liste héritée, tout en acceptant la lecture standard.
    if (!response.success && !skipToken) response = await service.getAll();
    if (!response.success) throw new Error(`Lecture SharePoint impossible pour ${label}${operationError(response) ? ` : ${operationError(response)}` : ""}`);
    rows.push(...(response.data || []));
    skipToken = response.skipToken;
    page += 1;
  } while (skipToken && page < maxPages);
  if (skipToken) throw new Error(`Lecture SharePoint incomplète pour ${label}`);
  return rows;
}

async function readDirections(): Promise<Row[]> {
  return readAllRows(_23_DirectionsService, "23_Directions");
}

function nextDirectionId(rows: Row[]): string {
  const max = rows.reduce((value, row) => {
    const match = String(row.field_1 || "").match(/^DIR-(\d+)$/i);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return `DIR-${max + 1}`;
}

function operationError(result: any): string {
  const error = result?.error;
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error.message === "string") return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return "Erreur SharePoint inconnue";
  }
}

/**
 * Crée ou met à jour uniquement les lignes fournies, sans supprimer les
 * autres lignes de la liste. Utile pour une écriture ciblée.
 */
async function upsertRows(service: CrudService, rows: Row[], keyOf: (row: Row) => string = (row) => String(row.field_1 || "")) {
  if (!rows.length) return;
  const existing = await readAllRows(service as PagedCrudService, "la liste SharePoint");
  const byKey = new Map(existing.map((row) => [keyOf(row), row]));
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const old = byKey.get(key);
    const safe = safeRow(row);
    const result = old?.ID != null
      ? await service.update(String(old.ID), safe)
      : await service.create(safe);
    if (!result?.success) throw new Error(`Écriture SharePoint refusée pour ${key}${operationError(result) ? ` : ${operationError(result)}` : ""}`);
  }
}

/**
 * Synchronise un périmètre précis d'une liste sans toucher aux données des
 * autres initiatives. Les lignes hors périmètre sont conservées.
 */
async function syncScopedList(
  service: CrudService,
  rows: Row[],
  keyOf: (row: Row) => string,
  isInScope: (row: Row) => boolean,
) {
  const existing = await readAllRows(service as PagedCrudService, "la liste SharePoint");
  const scoped = existing.filter(isInScope);
  const byKey = new Map(scoped.map((row) => [keyOf(row), row]));
  const wanted = new Set<string>();

  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    wanted.add(key);
    const old = byKey.get(key);
    const safe = safeRow(row);
    const result = old?.ID != null
      ? await service.update(String(old.ID), safe)
      : await service.create(safe);
    if (!result?.success) throw new Error(`Écriture SharePoint refusée pour ${key}${operationError(result) ? ` : ${operationError(result)}` : ""}`);
  }

  for (const old of scoped) {
    const key = keyOf(old);
    if (!key || wanted.has(key) || old.ID == null) continue;
    try {
      const result = await service.delete(String(old.ID));
      if (result && result.success === false) throw new Error(operationError(result));
    } catch (error) {
      throw new Error(`Suppression SharePoint refusée pour ${key}${error instanceof Error && error.message ? ` : ${error.message}` : ""}`);
    }
  }
}

async function verifyPersistedRow(service: CrudService, key: string, fields: Row, label: string): Promise<void> {
  const rows = await readAllRows(service as PagedCrudService, label);
  const row = rows.find((item: Row) => String(item.field_1 || "") === key);
  if (!row) throw new Error(`Écriture SharePoint non confirmée pour ${label}`);
  const mismatches = Object.entries(fields)
    .filter(([field, expected]) => expected != null && typeof expected !== "object" && String(row[field] ?? "") !== String(expected))
    .map(([field]) => field);
  if (mismatches.length) throw new Error(`Modification SharePoint non confirmée pour ${label} (${mismatches.join(", ")})`);
}

async function deleteByKey(service: CrudService, key: string, label: string): Promise<void> {
  const rows = await readAllRows(service as PagedCrudService, label);
  const row = rows.find((item: Row) => String(item.field_1 || "") === key);
  if (!row?.ID) throw new Error(`${label} introuvable dans SharePoint`);
  const deleted = await service.delete(String(row.ID));
  if (deleted && deleted.success === false) throw new Error(`Suppression SharePoint refusée pour ${label}${operationError(deleted) ? ` : ${operationError(deleted)}` : ""}`);
  const verification = await readAllRows(service as PagedCrudService, label);
  if (verification.some((item: Row) => String(item.field_1 || "") === key)) {
    throw new Error(`Suppression SharePoint non confirmée pour ${label}`);
  }
}

function departmentRow(department: Departement, chefEmail?: string): Row {
  return {
    Title: department.lib,
    field_1: department.id,
    field_2: department.lib,
    field_3: department.dir,
    field_4: person(chefEmail),
    field_5: "Oui",
  };
}

function userRow(user: Utilisateur): Row {
  return {
    Title: user.nom,
    field_1: user.id,
    field_2: user.nom,
    field_3: person(user.email, user.nom),
    field_4: user.dept,
    field_5: rolesToSharePoint(user),
    field_6: "Oui",
  };
}

export async function persistDepartment(department: Departement, chefEmail?: string): Promise<void> {
  const row = departmentRow(department, chefEmail);
  await upsertRows(_01_DepartementsService, [row]);
  await verifyPersistedRow(_01_DepartementsService, department.id, { Title: department.lib, field_2: department.lib, field_3: department.dir }, `le département ${department.lib}`);
}

export async function deleteDepartment(id: string): Promise<void> {
  await deleteByKey(_01_DepartementsService, id, `le département ${id}`);
}

export async function persistUser(user: Utilisateur): Promise<void> {
  const row = userRow(user);
  await upsertRows(_02_UtilisateursService, [row]);
  await verifyPersistedRow(_02_UtilisateursService, user.id, { Title: user.nom, field_2: user.nom, field_4: user.dept, field_5: rolesToSharePoint(user) }, `l'utilisateur ${user.nom}`);
}

/**
 * Réserve une nouvelle clé sur la base du contenu réel de SharePoint.
 * Les compteurs locaux sont volontairement exclus : ils peuvent être
 * différents après un rechargement ou entre deux utilisateurs connectés.
 */
export async function nextSharePointUserId(): Promise<string> {
  const rows = await readAllRows(_02_UtilisateursService, "02_Utilisateurs");
  const used = new Set(rows.map((row) => String(row.field_1 || "").trim().toUpperCase()).filter(Boolean));
  const max = rows.reduce((value, row) => {
    const match = String(row.field_1 || "").match(/^U(\d+)$/i);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  let index = max + 1;
  while (used.has(`U${index}`)) index += 1;
  return `U${index}`;
}

/** Crée une ligne utilisateur sans jamais basculer sur update en cas de collision. */
export async function createUser(user: Utilisateur): Promise<void> {
  const rows = await readAllRows(_02_UtilisateursService, "02_Utilisateurs");
  if (rows.some((row) => String(row.field_1 || "").trim() === user.id)) {
    throw new Error(`La clé utilisateur ${user.id} existe déjà dans SharePoint`);
  }
  const saved = await _02_UtilisateursService.create(safeRow(userRow(user)));
  if (!saved?.success) throw new Error(`Création de l'utilisateur refusée${operationError(saved) ? ` : ${operationError(saved)}` : ""}`);
  await verifyPersistedRow(_02_UtilisateursService, user.id, { Title: user.nom, field_2: user.nom, field_4: user.dept, field_5: rolesToSharePoint(user) }, `l'utilisateur ${user.nom}`);
}

export async function deleteUser(id: string): Promise<void> {
  await deleteByKey(_02_UtilisateursService, id, `l'utilisateur ${id}`);
}

/** Écrit une direction de façon ciblée afin que son nom ne serve jamais de clé de mise à jour. */
export async function persistDirectionCreate(direction: string, directorId: string): Promise<void> {
  const rows = await readDirections();
  const key = direction.trim().toLowerCase();
  if (rows.some((row) => directionKey(row) === key)) throw new Error(`La direction « ${direction} » existe déjà dans SharePoint`);
  const id = nextDirectionId(rows);
  const saved = await _23_DirectionsService.create(safeRow({ Title: direction, field_1: id, field_2: direction, field_3: "Oui", DirecteurId: directorId }));
  if (!saved.success) throw new Error(`Création de la direction refusée${operationError(saved) ? ` : ${operationError(saved)}` : ""}`);
  await verifyPersistedRow(_23_DirectionsService, id, { Title: direction, field_2: direction, DirecteurId: directorId }, `la direction ${direction}`);
}

/** Désigne le directeur d'une direction existante. */
export async function persistDirectionDirector(direction: string, directorId: string): Promise<void> {
  const rows = await readDirections();
  const row = rows.find((item) => directionKey(item) === direction.trim().toLowerCase());
  if (!row?.ID || !row.field_1) throw new Error(`Direction « ${direction} » introuvable dans SharePoint`);
  const saved = await _23_DirectionsService.update(String(row.ID), safeRow({ DirecteurId: directorId }) as Row);
  if (!saved.success) throw new Error(`Désignation du directeur refusée${operationError(saved) ? ` : ${operationError(saved)}` : ""}`);
  await verifyPersistedRow(_23_DirectionsService, String(row.field_1), { DirecteurId: directorId }, `la direction ${direction}`);
}

export async function persistDirectionRename(previous: string, next: string): Promise<void> {
  const rows = await readDirections();
  const row = rows.find((item) => directionKey(item) === previous.trim().toLowerCase());
  if (!row?.ID || !row.field_1) throw new Error(`Direction « ${previous} » introuvable dans SharePoint`);
  if (rows.some((item) => item.ID !== row.ID && directionKey(item) === next.trim().toLowerCase())) {
    throw new Error(`La direction « ${next} » existe déjà dans SharePoint`);
  }
  const saved = await _23_DirectionsService.update(String(row.ID), safeRow({ Title: next, field_2: next }));
  if (!saved.success) throw new Error(`Modification de la direction refusée${operationError(saved) ? ` : ${operationError(saved)}` : ""}`);
  await verifyPersistedRow(_23_DirectionsService, String(row.field_1), { Title: next, field_2: next }, `la direction ${previous}`);
}

export async function persistDirectionDelete(direction: string): Promise<void> {
  const rows = await readDirections();
  const row = rows.find((item) => directionKey(item) === direction.trim().toLowerCase());
  if (!row?.ID) throw new Error(`Direction « ${direction} » introuvable dans SharePoint`);
  await _23_DirectionsService.delete(String(row.ID));
  const remaining = await readDirections();
  if (remaining.some((item) => item.ID === row.ID || directionKey(item) === direction.trim().toLowerCase())) {
    throw new Error(`Suppression SharePoint non confirmée pour la direction « ${direction} »`);
  }
}

const PAYLOAD_CHUNK_PREFIX = "__CAP_PAYLOAD__";
function serializedValidationPayload(x: ValidationRequest): string {
  const payload = { ...x.payload };
  if (x.byEmail) payload._requesterEmail = x.byEmail;
  return JSON.stringify(payload);
}

function payloadChunks(serialized: string): string[] {
  const chars = Array.from(serialized);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += 200) chunks.push(chars.slice(index, index + 200).join(""));
  return chunks;
}

function validationRow(x: ValidationRequest): Row {
  const serialized = serializedValidationPayload(x);
  return {
    Title: x.label,
    field_1: x.id,
    field_2: x.kind,
    field_3: x.role,
    field_4: x.code,
    field_5: x.label,
    field_6: x.by,
    field_7: x.at,
    field_8: x.st,
    field_9: x.decAt || "",
    field_10: x.decBy || "",
    field_11: x.motif || "",
    field_12: serialized.length <= SHAREPOINT_TEXT_LIMIT ? serialized : JSON.stringify({ chunks: payloadChunks(serialized).length }),
  };
}

function notificationRow(x: Notification): Row {
  return {
    Title: x.message,
    field_1: x.id,
    field_2: x.recipientEmail,
    field_4: x.message,
    field_5: x.initiativeCode || "",
    field_6: x.validationId || "",
    field_7: x.at,
    field_8: x.read ? "Oui" : "Non",
    field_9: x.readAt || "",
    field_10: x.readerEmail || "",
    field_11: x.link || "",
  };
}

export async function persistNotification(notification: Notification): Promise<void> {
  const rows = await readAllRows(_22_NotificationsService, "22_Notifications");
  const existing = rows.find((x) => String(x.field_1 || "") === notification.id);
  const saved = existing?.ID != null
    ? await _22_NotificationsService.update(String(existing.ID), safeRow(notificationRow(notification)))
    : await _22_NotificationsService.create(safeRow(notificationRow(notification)));
  if (!saved.success) throw new Error(`Écriture de la notification refusée pour ${notification.recipientEmail}${operationError(saved) ? ` : ${operationError(saved)}` : ""}`);
  await verifyPersistedRow(_22_NotificationsService, notification.id, { field_4: notification.message, field_8: notification.read ? "Oui" : "Non" }, `la notification ${notification.id}`);
}

/** Persiste une demande et ses notifications sans dépendre des autres listes. */
export async function persistValidationRequest(request: ValidationRequest, notifications: Notification[]): Promise<void> {
  const validation = validationRow(request);
  const validationRows = await readAllRows(_12_ValidationsService, "12_Validations");
  const existingValidation = validationRows.find((x) => String(x.field_1 || "") === request.id);
  const savedValidation = existingValidation?.ID != null
    ? await _12_ValidationsService.update(String(existingValidation.ID), safeRow(validation))
    : await _12_ValidationsService.create(safeRow(validation));
  if (!savedValidation.success) throw new Error(`Création de la demande dans 12_Validations refusée${operationError(savedValidation) ? ` : ${operationError(savedValidation)}` : ""}`);
  await verifyPersistedRow(_12_ValidationsService, request.id, { field_8: request.st }, `la validation ${request.id}`);

  const notificationRows = await readAllRows(_22_NotificationsService, "22_Notifications");
  const existingNotifications = new Map(notificationRows.map((x) => [String(x.field_1 || ""), x]));
  for (const notification of notifications.filter((x) => x.validationId === request.id)) {
    const row = notificationRow(notification);
    const existing = existingNotifications.get(notification.id);
    const saved = existing?.ID != null
      ? await _22_NotificationsService.update(String(existing.ID), safeRow(row))
      : await _22_NotificationsService.create(safeRow(row));
    if (!saved.success) throw new Error(`Notification SharePoint refusée pour ${notification.recipientEmail}${operationError(saved) ? ` : ${operationError(saved)}` : ""}`);
    await verifyPersistedRow(_22_NotificationsService, notification.id, { field_4: notification.message, field_8: notification.read ? "Oui" : "Non" }, `la notification ${notification.id}`);
  }

  const visibleLines = request.lines.map((line) => String(line).slice(0, SHAREPOINT_TEXT_LIMIT));
  const serializedPayload = serializedValidationPayload(request);
  const chunks = serializedPayload.length > SHAREPOINT_TEXT_LIMIT ? payloadChunks(serializedPayload) : [];
  const storedLines = [
    ...visibleLines,
    ...chunks.map((chunk, index) => `${PAYLOAD_CHUNK_PREFIX}${String(index + 1).padStart(4, "0")}:${chunk}`),
  ];
  const lineRows = storedLines.map((line, index) => ({
    Title: line.slice(0, SHAREPOINT_TEXT_LIMIT),
    field_1: `${request.id}-${index + 1}`,
    field_2: request.id,
    field_3: s(index + 1),
    field_4: line.slice(0, SHAREPOINT_TEXT_LIMIT),
  }));
  await syncScopedList(
    _20_LignesValidationService,
    lineRows,
    (row) => String(row.field_1 || ""),
    (row) => String(row.field_2 || "") === request.id,
  );
}

/**
 * Persiste une décision dès le clic du validateur.
 * Cette écriture ciblée évite qu'un échec silencieux de la synchronisation globale
 * ne fasse réapparaître la demande « en attente » au prochain rechargement.
 */
export async function persistValidationDecision(request: ValidationRequest): Promise<void> {
  const row = validationRow(request);
  const validationRows = await readAllRows(_12_ValidationsService, "12_Validations");
  const existing = validationRows.find((x) => String(x.field_1 || "") === request.id);
  const result = existing?.ID != null
    ? await _12_ValidationsService.update(String(existing.ID), safeRow(row))
    : await _12_ValidationsService.create(safeRow(row));
  if (!result.success) throw new Error(`Écriture de la décision dans 12_Validations refusée${operationError(result) ? ` : ${operationError(result)}` : ""}`);
  await verifyPersistedRow(_12_ValidationsService, request.id, { field_8: request.st, field_9: request.decAt || "", field_10: request.decBy || "" }, `la validation ${request.id}`);
}

/** Persiste immédiatement la clôture d'un jalon dans la liste SharePoint dédiée. */
export async function persistJalonClosure(initiative: Initiative, jalonId: string, fin: string): Promise<void> {
  const jalonRows = await readAllRows(_08_JalonsService, "08_Jalons");

  const index = initiative.jalons.findIndex((jalon) => jalon.id === jalonId);
  const jalon = index >= 0 ? initiative.jalons[index] : undefined;
  if (!jalon) throw new Error(`Jalon introuvable pour ${initiative.code}`);

  const existing = jalonRows.find((row) => String(row.field_1 || "") === jalonId);
  const saved = existing?.ID != null
    ? await _08_JalonsService.update(String(existing.ID), safeRow({ field_6: "valide", field_7: fin }))
    : await _08_JalonsService.create(safeRow({
        Title: jalon.t,
        field_1: jalon.id,
        field_2: initiative.code,
        field_3: String(index + 1),
        field_4: jalon.t,
        field_5: jalon.due,
        field_6: "valide",
        field_7: fin,
        field_8: jalon.req,
        field_9: jalon.phase == null ? "" : String(jalon.phase),
        field_10: jalon.dur == null ? "" : String(jalon.dur),
        field_11: jalon._old || "",
        field_12: String(b(jalon.charte)),
        field_13: String(b(jalon.isNew)),
      }));
  if (!saved.success) throw new Error(`Clôture SharePoint refusée pour ${initiative.code} · ${jalon.t}${operationError(saved) ? ` : ${operationError(saved)}` : ""}`);
  await verifyPersistedRow(_08_JalonsService, jalonId, { field_6: "valide", field_7: fin }, `le jalon ${jalonId}`);
}

function initiativeRow(initiative: Initiative): Row {
  const metadataPrefix = "__CAP_INIT_META__";
  const metadata = JSON.stringify({
    desc: initiative.desc || "",
    origineDossier: initiative.origineDossier || "",
    origineDossierAutre: initiative.origineDossierAutre || "",
    axeBsc: initiative.axeBsc || "",
  });
  // Le schéma SharePoint actuellement connecté s'arrête à field_28 et la
  // colonne Description est limitée à 255 caractères. On y conserve les
  // métadonnées ajoutées récemment, sans dépasser cette limite.
  const packedDescription = `${metadataPrefix}${metadata}`;
  let description = packedDescription;
  if (description.length > 255) {
    let desc = initiative.desc || "";
    do {
      description = `${metadataPrefix}${JSON.stringify({
        desc,
        origineDossier: initiative.origineDossier || "",
        origineDossierAutre: initiative.origineDossierAutre || "",
        axeBsc: initiative.axeBsc || "",
      })}`;
      desc = desc.slice(0, Math.max(0, desc.length - 10));
    } while (description.length > 255 && desc.length > 0);
    if (description.length > 255) description = `${metadataPrefix}{}`;
  }

  return {
    Title: initiative.titre,
    field_1: initiative.code,
    field_2: initiative.type,
    field_3: initiative.titre,
    field_4: initiative.porteurId || "",
    field_5: initiative.dept || "",
    field_6: s(b(initiative.it)),
    field_7: s(b(initiative.terrain)),
    field_8: initiative.vtype || "",
    field_9: initiative.metier || "",
    field_10: initiative.benef || "",
    field_11: initiative.resIT || "",
    field_12: initiative.participants || "",
    field_13: initiative.gnat || "",
    field_14: s(initiative.phase),
    field_15: initiative.pil || "",
    field_16: initiative.prog || "",
    field_17: initiative.bv || "",
    field_18: initiative.bc || "",
    field_19: initiative.bvPend || "",
    field_20: initiative.deb || "",
    field_21: initiative.vfin || "",
    field_22: description,
    field_23: initiative.charteAt || "",
    field_24: initiative.abandoned ? "abandonnee" : "active",
    field_25: s(b(initiative.suspPend)),
    field_26: initiative.ratPend ? JSON.stringify(initiative.ratPend) : "",
    field_27: s(b(initiative.abandonPend)),
    field_28: s(b(!!initiative.abandoned)),
  };
}

function initiativeRelatedRows(initiative: Initiative) {
  const code = initiative.code;
  const jalonRows = initiative.jalons.map((j, k) => ({
    Title: j.t,
    field_1: j.id,
    field_2: code,
    field_3: s(k + 1),
    field_4: j.t,
    field_5: j.due,
    field_6: j.st,
    field_7: j.fin || "",
    field_8: j.req,
    field_9: s(j.phase),
    field_10: s(j.dur),
    field_11: j._old || "",
    field_12: s(b(j.charte)),
    field_13: s(b(j.isNew)),
  }));
  const benefitRows = (initiative.bens || []).map((x) => ({
    Title: x.lib,
    field_1: x.id,
    field_2: code,
    field_3: x.lib,
    field_4: x.dep,
    field_5: x.cib,
    field_6: x.unit,
    field_7: x.dmes,
    field_8: x.val || "",
    field_9: x.res || "",
    field_10: x.val ? "mesure" : "a_mesurer",
    field_11: x.pendDel || "",
  }));
  const recoRows = (initiative.recos || []).map((x) => ({
    Title: x.txt,
    field_1: x.id,
    field_2: code,
    field_3: x.at,
    field_4: x.txt,
    field_5: x.resp,
    field_6: x.ech,
    field_7: x.st,
    field_8: x.obj || "",
    field_9: x.dep || "",
    field_10: x.cib || "",
    field_11: x.unit || "",
    field_12: x.val || "",
    field_13: x.res || "",
    field_14: s(b(x.abandonPend)),
  }));
  const suiviRows = (initiative.recos || []).flatMap((reco) => reco.suivi.map((suivi, k) => ({
    Title: suivi.txt,
    field_1: `${reco.id}-${k + 1}`,
    field_2: reco.id,
    field_3: suivi.at,
    field_4: suivi.txt,
    field_5: s(b(suivi.auto)),
  })));
  const fileRows = [
    ...initiative.jalons.flatMap((j) => j.f.map((file) => ({
      Title: file.n,
      field_1: `${code}-${j.id}-${file.n}`,
      field_2: code,
      field_3: j.id,
      field_4: "",
      field_5: file.n,
      field_6: file.s,
      field_7: file.at,
      field_8: s(b(file.ok)),
      field_9: fileMeta(file),
    }))),
    ...(initiative.recos || []).flatMap((reco) => reco.f.map((file) => ({
      Title: file.n,
      field_1: `${code}-${reco.id}-${file.n}`,
      field_2: code,
      field_3: "",
      field_4: reco.id,
      field_5: file.n,
      field_6: file.s,
      field_7: file.at,
      field_8: s(b(file.ok)),
      field_9: fileMeta(file),
    }))),
  ];
  const commentRows = initiative.jalons.flatMap((j) => j.coms.map((x, k) => ({
    Title: x.txt,
    field_1: `${j.id}-com-${k + 1}`,
    field_2: j.id,
    field_3: code,
    field_4: x.at,
    field_5: x.txt,
    field_6: "",
  })));
  const diffRows = initiative.jalons.flatMap((j) => j.difs.map((x, k) => ({
    Title: x.txt,
    field_1: `${j.id}-dif-${k + 1}`,
    field_2: j.id,
    field_3: code,
    field_4: x.at,
    field_5: x.txt,
    field_6: "",
    field_7: "ouvert",
  })));
  const budgetRows = (initiative.bcHist || []).map((x, k) => ({
    Title: `${code}-${k + 1}`,
    field_1: `${code}-BC-${k + 1}`,
    field_2: code,
    field_3: x.at,
    field_4: x.v,
    field_5: x.comment || "",
    field_6: "",
  }));
  const planRows = initiative.plan ? [{
    Title: code,
    field_1: `${code}-PLAN`,
    field_2: code,
    field_3: initiative.plan.reqId || "",
    field_4: initiative.plan.endBefore,
    field_5: initiative.plan.changes.join("\n"),
    field_6: initiative.plan.reqId ? "soumise" : "brouillon",
  }] : [];
  const planItemRows = initiative.plan?.items.map((item, k) => ({
    Title: item.t,
    field_1: `${code}-PLAN-${item.id}`,
    field_2: code,
    field_3: initiative.plan?.reqId || "",
    field_4: s(k + 1),
    field_5: item.t,
    field_6: s(item.dur),
    field_7: item.due,
    field_8: item.req,
    field_9: s(b(item.isNew)),
  })) || [];

  return { jalonRows, benefitRows, recoRows, suiviRows, fileRows, commentRows, diffRows, budgetRows, planRows, planItemRows };
}

/**
 * Persiste une seule initiative et ses données enfants. Les autres
 * initiatives et les autres listes SharePoint ne sont pas modifiées.
 */
export async function persistInitiativeSnapshot(initiative: Initiative): Promise<void> {
  const related = initiativeRelatedRows(initiative);
  await Promise.all([
    upsertRows(_07_InitiativesService, [initiativeRow(initiative)]),
    syncScopedList(_08_JalonsService, related.jalonRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === initiative.code),
    syncScopedList(_09_BeneficesService, related.benefitRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === initiative.code),
    syncScopedList(_10_RecommandationsService, related.recoRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === initiative.code),
    syncScopedList(_11_SuivisRecommandationsService, related.suiviRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "").startsWith(`${initiative.code}-R`)),
    syncScopedList(_13_DocumentsService, related.fileRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === initiative.code),
    syncScopedList(_14_HistoriqueBudgetsService, related.budgetRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === initiative.code),
    syncScopedList(_15_JalonCommentairesService, related.commentRows, (row) => String(row.field_1 || ""), (row) => String(row.field_3 || "") === initiative.code),
    syncScopedList(_16_JalonDifficultesService, related.diffRows, (row) => String(row.field_1 || ""), (row) => String(row.field_3 || "") === initiative.code),
    syncScopedList(_17_ReplanificationsService, related.planRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === initiative.code),
    syncScopedList(_18_ReplanificationItemsService, related.planItemRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === initiative.code),
  ]);
}

/** Supprime une initiative et uniquement ses lignes dépendantes. */
export async function deleteInitiativeSnapshot(code: string): Promise<void> {
  const noRows: Row[] = [];
  const validationRows = await readAllRows(_12_ValidationsService, "12_Validations");
  const validationIds = new Set<string>(
    validationRows
      .filter((row: Row) => String(row.field_4 || "") === code)
      .map((row: Row) => String(row.field_1 || ""))
      .filter(Boolean),
  );
  await Promise.all([
    syncScopedList(_07_InitiativesService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_1 || "") === code),
    syncScopedList(_08_JalonsService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === code),
    syncScopedList(_09_BeneficesService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === code),
    syncScopedList(_10_RecommandationsService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === code),
    syncScopedList(_11_SuivisRecommandationsService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "").startsWith(`${code}-R`)),
    syncScopedList(_13_DocumentsService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === code),
    syncScopedList(_14_HistoriqueBudgetsService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === code),
    syncScopedList(_15_JalonCommentairesService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_3 || "") === code),
    syncScopedList(_16_JalonDifficultesService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_3 || "") === code),
    syncScopedList(_17_ReplanificationsService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === code),
    syncScopedList(_18_ReplanificationItemsService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_2 || "") === code),
    syncScopedList(_12_ValidationsService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_4 || "") === code),
    syncScopedList(_20_LignesValidationService, noRows, (row) => String(row.field_1 || ""), (row) => validationIds.has(String(row.field_2 || ""))),
    syncScopedList(_22_NotificationsService, noRows, (row) => String(row.field_1 || ""), (row) => String(row.field_5 || "") === code),
  ]);
}

export async function persistStrategicReference(kind: "pil" | "prog", reference: Pilier | Programme): Promise<void> {
  const row = {
    Title: reference.code,
    field_1: reference.id,
    field_2: reference.code,
    field_3: reference.lib,
    // 03_Piliers conserve encore l'état sous forme de texte, tandis que
    // 04_Programmes expose une vraie colonne SharePoint Oui/Non.
    field_4: kind === "prog" ? true : "Oui",
    ResponsableId: reference.responsableId || "",
  };
  const service = kind === "pil" ? _03_PiliersService : _04_ProgrammesService;
  await upsertRows(service, [row]);
  await verifyPersistedRow(service, reference.id, { Title: reference.code, field_2: reference.code, field_3: reference.lib, ResponsableId: reference.responsableId || "" }, `${kind === "pil" ? "le pilier" : "le programme"} ${reference.code}`);
}

export async function deleteStrategicReference(kind: "pil" | "prog", id: string): Promise<void> {
  const service = kind === "pil" ? _03_PiliersService : _04_ProgrammesService;
  await syncScopedList(service, [], (row) => String(row.field_1 || ""), (row) => String(row.field_1 || "") === id);
}

export async function persistInitiativeType(key: string, template: InitiativeTemplate): Promise<void> {
  const typeRow = {
    Title: template.label,
    field_1: key,
    field_2: template.label,
    field_3: template.desc || "",
    field_4: template.reco ? "Recommandations" : "Bénéfices",
    field_5: template.active !== false,
    field_6: template.custom ? "Oui" : "Non",
  };
  const stepRows = template.steps.map((step, index) => ({
    Title: step.t,
    field_1: key,
    field_2: index + 1,
    field_3: step.t,
    field_4: Number(step.dur) || 0,
    field_5: step.req,
    field_6: Number(step.phase) || 0,
    field_7: b(step.charte),
    field_8: b(step.it),
    field_9: b(step.terrain),
  }));
  await Promise.all([
    upsertRows(_05_TypesInitiativeService, [typeRow]),
    syncScopedList(_06_EtapesTypesInitiativeService, stepRows, (row) => `${row.field_1}|${row.field_2}`, (row) => String(row.field_1 || "") === key),
  ]);
}

const SETTING_PREFIX = "__PARAM__";

/** Synchronise une liste de paramètres administrables dans 05_TypesInitiative. */
export async function persistAppSettings(category: SettingCategory, values: string[]): Promise<void> {
  const rows = values.map((value, index) => ({
    Title: value,
    field_1: `${SETTING_PREFIX}${category}__${index + 1}`,
    field_2: value,
    field_3: category,
    field_4: String(index + 1),
    field_5: true,
    field_6: "Paramètre",
  }));
  await syncScopedList(
    _05_TypesInitiativeService,
    rows,
    (row) => String(row.field_1 || ""),
    (row) => String(row.field_1 || "").startsWith(`${SETTING_PREFIX}${category}__`),
  );
}

export async function deleteInitiativeType(key: string): Promise<void> {
  await Promise.all([
    syncScopedList(_05_TypesInitiativeService, [], (row) => String(row.field_1 || ""), (row) => String(row.field_1 || "") === key),
    syncScopedList(_06_EtapesTypesInitiativeService, [], (row) => `${row.field_1}|${row.field_2}`, (row) => String(row.field_1 || "") === key),
  ]);
}

function logKey(entry: LogEntry): string {
  let hash = 0;
  for (const char of `${entry.who || ""}|${entry.m}`) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `LOG-${entry.at}-${Math.abs(hash)}`;
}

/** Persiste une seule entrée du journal d'activité. */
export async function persistLogEntry(entry: LogEntry): Promise<void> {
  const row = { Title: entry.m, field_1: logKey(entry), field_2: entry.at, field_3: s(b(entry.sys)), field_4: entry.m, field_5: entry.who || "", field_6: "" };
  await upsertRows(_19_JournalActiviteService, [row]);
}

export function sharePointDepartmentRecord(dept: { id: string; lib: string; dir: string }, chefEmail?: string): Row {
  return departmentRow(dept, chefEmail);
}

export const sharePointServiceHealth = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return "Erreur SharePoint inconnue";
};
