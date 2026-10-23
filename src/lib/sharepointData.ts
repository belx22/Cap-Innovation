import { _01_DepartementsService } from "../generated/services/_01_DepartementsService";
import { _02_UtilisateursService } from "../generated/services/_02_UtilisateursService";
import { effectiveRole, normalizeRoles } from "./roles";
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
import { _19_JournalActiviteService } from "../generated/services/_19_JournalActiviteService";
import { _20_LignesValidationService } from "../generated/services/_20_LignesValidationService";
import { _17_ReplanificationsService } from "../generated/services/_17_ReplanificationsService";
import { _18_ReplanificationItemsService } from "../generated/services/_18_ReplanificationItemsService";
import { _21_JoursFeriesService } from "../generated/services/_21_JoursFeriesService";
import { _22_NotificationsService } from "../generated/services/_22_NotificationsService";
import { _23_DirectionsService } from "../generated/services/_23_DirectionsService";
import type { Departement, FichierJoint, Initiative, Jalon, LogEntry, Notification, Programme, Pilier, Recommandation, Utilisateur, ValidationRequest } from "../data/types";
import { TEMPLATES, TYPES } from "../data/templates";
import { HOLIDAYS } from "../data/holidays";
import { SETTING_CATALOGS, type SettingCategory } from "../data/reference";
import { sharePointFileUrl, sharePointFolderPath } from "./fileUploadFlow";

type Row = Record<string, any>;

const value = (row: Row, n: number): any => row[`field_${n}`];
const txt = (row: Row, n: number): string => String(value(row, n) ?? "");
function personEmail(value: any): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  if (typeof item === "string") {
    const claim = item.match(/(?:membership\|)?([^|\s]+@[^|\s]+)/i)?.[1];
    return claim || (item.includes("@") ? item : undefined);
  }
  if (!item || typeof item !== "object") return undefined;
  const direct = item.Email || item.email || item.EMail || item.UserPrincipalName || item.userPrincipalName;
  if (typeof direct === "string" && direct.includes("@")) return direct.trim();
  const claims = item.Claims || item.claims;
  return typeof claims === "string" ? personEmail(claims) : undefined;
}
const bool = (row: Row, n: number): boolean => [true, "true", "True", "Oui", "oui", 1, "1"].includes(value(row, n));
const result = <T>(x: T[]): T[] => x;

type PagedListService = {
  getAll: (options?: { top?: number; skipToken?: string }) => Promise<{ success?: boolean; data?: Row[]; skipToken?: string; error?: unknown }>;
};

async function readAllRows(service: PagedListService, label: string): Promise<Row[]> {
  const rows: Row[] = [];
  let skipToken: string | undefined;
  let page = 0;
  const maxPages = 50;
  do {
    let response = await service.getAll(skipToken ? { top: 5000, skipToken } : { top: 5000 });
    if (!response.success && !skipToken) response = await service.getAll();
    if (!response.success) throw new Error(`Lecture SharePoint impossible pour ${label}`);
    rows.push(...(response.data || []));
    skipToken = response.skipToken;
    page += 1;
  } while (skipToken && page < maxPages);
  if (skipToken) throw new Error(`Lecture SharePoint incomplète pour ${label}`);
  return rows;
}
const dateOr = (v: string): string => v || "";
function descriptionMetadata(value: string): { desc: string; origineDossier?: string; origineDossierAutre?: string; axeBsc?: string } {
  const prefix = "__CAP_INIT_META__";
  if (!value.startsWith(prefix)) return { desc: value };
  try {
    const parsed = JSON.parse(value.slice(prefix.length));
    return { desc: String(parsed.desc || ""), origineDossier: parsed.origineDossier || undefined, origineDossierAutre: parsed.origineDossierAutre || undefined, axeBsc: parsed.axeBsc || undefined };
  } catch {
    return { desc: value };
  }
}
const validationStatus = (v: string): ValidationRequest["st"] => {
  const key = v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ _-]/g, "");
  if (key === "approuvee" || key === "approuve") return "approuvee";
  if (key === "rejetee" || key === "rejet") return "rejetee";
  if (key === "retiree" || key === "retire") return "retiree";
  return "attente";
};
const validationRole = (v: string): ValidationRequest["role"] => {
  const key = v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (key.includes("chef")) return "chef";
  if (key.includes("direct")) return "dir";
  if (key.includes("gestion")) return "gest";
  if (key.includes("admin")) return "admin";
  return v as ValidationRequest["role"];
};
const userProfile = (v: string): Utilisateur["prof"] => {
  const key = v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ _-]/g, "");
  if (key.includes("contrib")) return "contrib";
  if (key.includes("gestion")) return "gest";
  if (key.includes("chef")) return "chef";
  if (key.includes("direct")) return "dir";
  if (key.includes("admin")) return "admin";
  return v as Utilisateur["prof"];
};

function filesFor(rows: Row[], initiativeCode: string, jalonId?: string, recoId?: string): FichierJoint[] {
  return rows
    .filter((r) => txt(r, 2) === initiativeCode && (!jalonId || txt(r, 3) === jalonId) && (!recoId || txt(r, 4) === recoId))
    .map((r) => {
      const rawMeta = txt(r, 9);
      let meta: { url?: string; pendDel?: string } = {};
      try { meta = rawMeta.startsWith("{") ? JSON.parse(rawMeta) : { pendDel: rawMeta }; } catch { meta = { pendDel: rawMeta }; }
      const author = personEmail(r["Author#Claims"] || r.Author || r["Editor#Claims"] || r.Editor) || "Application Cap Innovation";
      const folder = jalonId
        ? sharePointFolderPath("Projets", initiativeCode, "Jalons", jalonId, author)
        : sharePointFolderPath("Projets", initiativeCode, "Recommandations", recoId || "", author);
      const directPath = String(r["{FullPath}"] || "").trim();
      const oldDirectUrl = directPath.includes("/Documents partages/") && !directPath.includes("/Lists/") ? directPath : "";
      return {
        n: txt(r, 5),
        s: txt(r, 6),
        at: txt(r, 7),
        ok: bool(r, 8),
        url: meta.url || oldDirectUrl || sharePointFileUrl(folder, txt(r, 5)),
        pendDel: meta.pendDel || undefined,
      };
    });
}

export interface SharePointSnapshot {
  departments: Departement[];
  users: Utilisateur[];
  pillars: Pilier[];
  programmes: Programme[];
  initiatives: Initiative[];
  log: LogEntry[];
  validations: ValidationRequest[];
  notifications: Notification[];
  holidays: string[];
  directions: string[];
  directionDirectors: Record<string, string>;
}

function hydrateReferenceData(typeRows: Row[], stepRows: Row[], holidayRows: Row[]) {
  const settingRows = typeRows.filter((row) => txt(row, 6) === "Paramètre" || txt(row, 1).startsWith("__PARAM__"));
  (Object.keys(SETTING_CATALOGS) as SettingCategory[]).forEach((category) => {
    const values = settingRows
      .filter((row) => txt(row, 3) === category && bool(row, 5))
      .sort((a, b) => Number(txt(a, 4)) - Number(txt(b, 4)))
      .map((row) => txt(row, 2) || String(row.Title || ""))
      .filter(Boolean);
    if (values.length) SETTING_CATALOGS[category].splice(0, SETTING_CATALOGS[category].length, ...values);
  });
  const initiativeTypeRows = typeRows.filter((row) => !settingRows.includes(row));
  if (initiativeTypeRows.length) {
    const next: Record<string, any> = {};
    initiativeTypeRows.forEach((x) => {
      const key = txt(x, 1);
      if (!key) return;
      next[key] = { label: txt(x, 2) || x.Title || key, desc: txt(x, 3) || undefined, reco: txt(x, 4) === "Recommandations", active: bool(x, 5), custom: txt(x, 6) === "Oui", steps: [] };
    });
    stepRows.forEach((x) => {
      const key = txt(x, 1);
      if (!next[key]) return;
      next[key].steps.push({ t: txt(x, 3), dur: Number(txt(x, 4)) || 1, req: txt(x, 5), phase: Number(txt(x, 6)) || undefined, charte: bool(x, 7), it: bool(x, 8), terrain: bool(x, 9) });
    });
    Object.keys(TEMPLATES).forEach((key) => delete TEMPLATES[key]);
    Object.assign(TEMPLATES, next);
    TYPES.splice(0, TYPES.length, ...Object.entries(next).map(([key, t]) => [key, t.label] as [string, string]));
  }
  if (holidayRows.length) {
    HOLIDAYS.splice(0, HOLIDAYS.length, ...holidayRows.map((x) => txt(x, 2) || txt(x, 3)).filter(Boolean));
  }
}

export async function loadSharePointSnapshot(): Promise<SharePointSnapshot | null> {
  try {
    const [d, u, p, g, types, steps, i, j, b, r, rs, v, docs, budgets, comments, diffs, plans, planItems, logs, lines, holidays, notifications, directions] = await Promise.all([
      readAllRows(_01_DepartementsService, "01_Departements"), readAllRows(_02_UtilisateursService, "02_Utilisateurs"), readAllRows(_03_PiliersService, "03_Piliers"), readAllRows(_04_ProgrammesService, "04_Programmes"),
      readAllRows(_05_TypesInitiativeService, "05_TypesInitiative"), readAllRows(_06_EtapesTypesInitiativeService, "06_EtapesTypesInitiative"),
      readAllRows(_07_InitiativesService, "07_Initiatives"), readAllRows(_08_JalonsService, "08_Jalons"), readAllRows(_09_BeneficesService, "09_Benefices"), readAllRows(_10_RecommandationsService, "10_Recommandations"),
      readAllRows(_11_SuivisRecommandationsService, "11_SuivisRecommandations"), readAllRows(_12_ValidationsService, "12_Validations"), readAllRows(_13_DocumentsService, "13_Documents"), readAllRows(_14_HistoriqueBudgetsService, "14_HistoriqueBudgets"),
      readAllRows(_15_JalonCommentairesService, "15_JalonCommentaires"), readAllRows(_16_JalonDifficultesService, "16_JalonDifficultes"), readAllRows(_17_ReplanificationsService, "17_Replanifications"), readAllRows(_18_ReplanificationItemsService, "18_ReplanificationItems"), readAllRows(_19_JournalActiviteService, "19_JournalActivite"), readAllRows(_20_LignesValidationService, "20_LignesValidation"), readAllRows(_21_JoursFeriesService, "21_JoursFeries"), readAllRows(_22_NotificationsService, "22_Notifications"), readAllRows(_23_DirectionsService, "23_Directions"),
    ]);

    const typeRows = result<Row>(types);
    const stepRows = result<Row>(steps);
    const holidayRows = result<Row>(holidays);
    hydrateReferenceData(typeRows, stepRows, holidayRows);
    const directionRows = result<Row>(directions);
    const directionCatalog = directionRows.map((x) => txt(x, 2) || x.Title || "").filter(Boolean);
    const directionDirectors = Object.fromEntries(directionRows
      .map((x) => [txt(x, 2) || x.Title || "", String(x.DirecteurId || "").trim()] as const)
      .filter(([direction, directorId]) => !!direction && !!directorId));
    const departments = result<Row>(d).map((x) => ({ id: txt(x, 1), lib: txt(x, 2) || x.Title || "", dir: txt(x, 3) }));
    const users = result<Row>(u).map((x) => {
      const email = personEmail(value(x, 3)) || personEmail(x["field_3#Claims"]) || personEmail(x.Email);
      const rawProfiles = txt(x, 5);
      const profils = normalizeRoles(rawProfiles.split(/[;,|]/).map((role) => userProfile(role)), userProfile(rawProfiles));
      return { id: txt(x, 1), nom: txt(x, 2) || x.Title || "", email, dept: txt(x, 4), profils, prof: effectiveRole(profils, userProfile(rawProfiles)) };
    });
    const pillars = result<Row>(p).map((x) => ({ id: txt(x, 1), code: txt(x, 2), lib: txt(x, 3), responsableId: String(x.ResponsableId || "").trim() || undefined }));
    const programmes = result<Row>(g).map((x) => ({ id: txt(x, 1), code: txt(x, 2), lib: txt(x, 3), responsableId: String(x.ResponsableId || "").trim() || undefined }));
    const docRows = result<Row>(docs);
    const commentRows = result<Row>(comments);
    const diffRows = result<Row>(diffs);
    const recoRows = result<Row>(r);
    const recoFollowRows = result<Row>(rs);
    const benefitRows = result<Row>(b);
    const budgetRows = result<Row>(budgets);
    const jalonRows = result<Row>(j);

    const planRows = result<Row>(plans);
    const planItemRows = result<Row>(planItems);
    const initiatives = result<Row>(i).map((x) => {
      const code = txt(x, 1);
      const jalons: Jalon[] = jalonRows.filter((z) => txt(z, 2) === code).sort((a, z) => Number(txt(a, 3)) - Number(txt(z, 3))).map((z) => ({
        id: txt(z, 1), t: txt(z, 4), due: dateOr(txt(z, 5)), st: (txt(z, 6) || "a_venir") as Jalon["st"], fin: dateOr(txt(z, 7)) || undefined,
        req: txt(z, 8), phase: Number(txt(z, 9)) || undefined, dur: Number(txt(z, 10)) || undefined, _old: dateOr(txt(z, 11)) || undefined,
        charte: bool(z, 12), isNew: bool(z, 13), f: filesFor(docRows, code, txt(z, 1)),
        coms: commentRows.filter((c) => txt(c, 2) === txt(z, 1)).map((c) => ({ at: txt(c, 4), txt: txt(c, 5) })),
        difs: diffRows.filter((c) => txt(c, 2) === txt(z, 1)).map((c) => ({ at: txt(c, 4), txt: txt(c, 5) })),
      }));
      const recos: Recommandation[] = recoRows.filter((z) => txt(z, 2) === code).map((z) => ({
        id: txt(z, 1), at: txt(z, 3), txt: txt(z, 4), resp: txt(z, 5), ech: txt(z, 6), st: (txt(z, 7) || "a_lancer") as Recommandation["st"],
        obj: txt(z, 8) || undefined, dep: txt(z, 9) || undefined, cib: txt(z, 10) || undefined, unit: txt(z, 11) || undefined,
        val: txt(z, 12) || undefined, res: txt(z, 13) || undefined, abandonPend: bool(z, 14),
        suivi: recoFollowRows.filter((s) => txt(s, 2) === txt(z, 1)).map((s) => ({ at: txt(s, 3), txt: txt(s, 4), auto: bool(s, 5) })), f: filesFor(docRows, code, undefined, txt(z, 1)),
      }));
      const plan = planRows.find((p) => txt(p, 2) === code);
      const items = plan ? planItemRows.filter((p) => txt(p, 2) === code).sort((a, z) => Number(txt(a, 4)) - Number(txt(z, 4))).map((p) => ({ id: txt(p, 1).replace(`${code}-PLAN-`, ""), t: txt(p, 5), dur: Number(txt(p, 6)) || 1, due: txt(p, 7), req: txt(p, 8), isNew: bool(p, 9) })) : [];
      const initiativeDescription = descriptionMetadata(txt(x, 22));
      return {
        code, type: txt(x, 2), it: bool(x, 6), terrain: bool(x, 7), titre: txt(x, 3) || x.Title || "", porteur: users.find((q) => q.id === txt(x, 4))?.nom || txt(x, 4),
        porteurId: txt(x, 4), dept: txt(x, 5), vtype: txt(x, 8) || undefined, metier: txt(x, 9) || undefined, benef: txt(x, 10) || undefined,
        resIT: txt(x, 11) || undefined, participants: txt(x, 12) || undefined, gnat: txt(x, 13) || undefined, phase: Number(txt(x, 14)) || 0,
        pil: txt(x, 15) || undefined, prog: txt(x, 16) || undefined, bv: txt(x, 17) || undefined, bc: txt(x, 18) || undefined,
        bvPend: txt(x, 19) || undefined, deb: txt(x, 20) || undefined, vfin: txt(x, 21) || undefined, desc: initiativeDescription.desc || undefined,
        charteAt: txt(x, 23) || undefined, origineDossier: txt(x, 29) || initiativeDescription.origineDossier, origineDossierAutre: txt(x, 30) || initiativeDescription.origineDossierAutre, axeBsc: txt(x, 31) || initiativeDescription.axeBsc, jalons, bens: benefitRows.filter((z) => txt(z, 2) === code).map((z) => ({ id: txt(z, 1), lib: txt(z, 3), dep: txt(z, 4), cib: txt(z, 5), unit: txt(z, 6), dmes: txt(z, 7), val: txt(z, 8) || undefined, res: txt(z, 9) || undefined, mesAt: txt(z, 7) || undefined, pendDel: txt(z, 11) || undefined })), recos,
        bcHist: budgetRows.filter((z) => txt(z, 2) === code).map((z) => ({ at: txt(z, 3), v: txt(z, 4), comment: txt(z, 5) || undefined, file: undefined })),
        plan: plan ? { items, changes: txt(plan, 6) ? txt(plan, 6).split("\n").filter(Boolean) : [], endBefore: txt(plan, 4), reqId: txt(plan, 3) || undefined } : undefined,
      } as Initiative;
    });
    return {
      departments, users, pillars, programmes, initiatives,
      log: result<Row>(logs).map((x) => ({ at: txt(x, 2), sys: bool(x, 3), m: txt(x, 4), who: txt(x, 5) || undefined })),
      validations: result<Row>(v).map((x) => {
        const validationLines = result<Row>(lines).filter((line) => txt(line, 2) === txt(x, 1)).sort((a, z) => Number(txt(a, 3)) - Number(txt(z, 3)));
        const chunkPrefix = "__CAP_PAYLOAD__";
        const serializedChunks = validationLines.map((line) => txt(line, 4)).filter((line) => line.startsWith(chunkPrefix)).map((line) => line.slice(line.indexOf(":") + 1));
        let payload: Record<string, unknown> = {};
        try {
          const serialized = serializedChunks.length ? serializedChunks.join("") : txt(x, 12);
          payload = serialized ? JSON.parse(serialized) : {};
        } catch (error) {
          console.error(`Payload de validation ${txt(x, 1)} illisible`, error);
        }
        const byEmail = typeof payload._requesterEmail === "string" ? payload._requesterEmail : undefined;
        return { id: txt(x, 1), kind: txt(x, 2) as ValidationRequest["kind"], role: validationRole(txt(x, 3)), code: txt(x, 4), label: txt(x, 5), lines: validationLines.map((line) => txt(line, 4)).filter((line) => !line.startsWith(chunkPrefix)), by: txt(x, 6), byEmail, at: txt(x, 7), st: validationStatus(txt(x, 8)), decAt: txt(x, 9) || undefined, decBy: txt(x, 10) || undefined, motif: txt(x, 11) || undefined, payload };
      }),
      notifications: result<Row>(notifications).map((x) => {
        const id = txt(x, 1);
        const type = id.startsWith("ASSIGN-") ? "affectation" : id.startsWith("VAL-") || id.startsWith("DEC-") ? "validation" : undefined;
        return { id, recipientEmail: txt(x, 2), type, message: txt(x, 4), initiativeCode: txt(x, 5) || undefined, validationId: txt(x, 6) || undefined, at: txt(x, 7), read: bool(x, 8), readAt: txt(x, 9) || undefined, readerEmail: txt(x, 10) || undefined, link: txt(x, 11) || undefined };
      }),
      holidays: holidayRows.map((x) => txt(x, 2) || txt(x, 3)).filter(Boolean),
      directions: Array.from(new Set([...directionCatalog, ...departments.map((d) => d.dir).filter(Boolean)])),
      directionDirectors,
    };
  } catch (error) {
    console.error("Lecture SharePoint impossible", error);
    throw error;
  }
}
