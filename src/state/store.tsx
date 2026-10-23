import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type {
  Benefice,
  BudgetUpdate,
  FichierJoint,
  Initiative,
  Jalon,
  LogEntry,
  Notification,
  Recommandation,
  UserProfile,
  Utilisateur,
  ValidationRequest,
} from "../data/types";
import { UNRESOLVED, resolveIdentity } from "../lib/identity";
import { loadSharePointSnapshot } from "../lib/sharepointData";
import { deleteInitiativeSnapshot, persistInitiativeSnapshot, persistLogEntry, persistNotification, persistValidationDecision, persistValidationRequest, sharePointServiceHealth } from "../lib/sharepointSync";
import { TODAY, addMonths, d, days, fmtY, iso, stamp } from "../lib/dates";
import { sharePointFolderPath, uploadedFileUrl, uploadFileToSharePoint, type UploadableFile } from "../lib/fileUploadFlow";
import { sendAssignmentEmail } from "../lib/notificationFlow";
import {
  artOf,
  budPct,
  charteOK,
  deptName,
  endOf,
  fmtM,
  fmtXAF,
  isProj,
  isReco,
  needsDecision,
  normBens,
  normRecos,
  numv,
  prog,
  suivi,
  typeLbl,
} from "../lib/domain";
import { DEPTS, DIRECTIONS, DIRECTION_DIRECTORS, PILIERS, PROGS, USERS, SHORT, chefOf, pilOf, progOf, refLbl } from "../data/reference";
import { HOLIDAYS } from "../data/holidays";
import { VRULES } from "../lib/validation";
import { hasRole } from "../lib/roles";
import {
  addDraftJalon as addDraftJalonToPlan,
  moveJalonInPlan,
  planEnd,
  planRole,
  planShiftDays,
  removeJalonFromPlan,
} from "../lib/planning";

interface State {
  innos: Initiative[];
  log: LogEntry[];
  profile: UserProfile;
  /** Identité réelle résolue via Office 365 (ou `UNRESOLVED` tant qu'elle ne l'est pas). */
  me: Utilisateur;
  /** Département simulé par un administrateur prévisualisant le profil « Chef de département ». */
  viewAsDept: string | null;
  vals: ValidationRequest[];
  notifications: Notification[];
  vSeq: number;
  tick: number;
}

type Action =
  | { type: "COMMIT_STATE"; state: State }
  | { type: "HYDRATE_SHAREPOINT"; innos: Initiative[]; log: LogEntry[]; vals: ValidationRequest[]; notifications: Notification[] }
  | { type: "SET_IDENTITY"; me: Utilisateur }
  | { type: "SET_VIEW_AS_DEPT"; dept: string | null }
  | { type: "CLOSE_JALON"; code: string; jalonId: string; fin: string }
  | { type: "ASK_COMPLEMENT"; code: string; jalonId: string; motif: string }
  | { type: "ADD_NOTE"; code: string; jalonId: string; kind: "com" | "dif"; txt: string }
  | { type: "ADD_FILES"; code: string; jalonId: string; files: { name: string; size: string; url?: string }[] }
  | { type: "CONFIRM_FILE"; code: string; jalonId: string; fileName: string }
  | { type: "CREATE_INITIATIVE"; inno: Initiative }
  | { type: "REQUEST_INITIATIVE_EDIT"; req: ValidationRequest }
  | { type: "DELETE_INITIATIVE"; code: string }
  | { type: "SET_PROFILE"; profile: UserProfile }
  | { type: "ADD_RECO"; code: string; reco: Recommandation }
  | { type: "UPDATE_RECO"; code: string; recoId: string; patch: Partial<Recommandation> }
  | { type: "ADD_RECO_SUIVI"; code: string; recoId: string; txt: string }
  | { type: "ADD_RECO_FILE"; code: string; recoId: string; file: { name: string; size: string; url?: string } }
  | { type: "ADD_BENEFIT"; code: string; ben: Benefice }
  | { type: "UPDATE_BENEFIT"; code: string; benId: string; patch: Partial<Benefice> }
  | { type: "REQUEST_VALIDATION"; req: ValidationRequest }
  | { type: "DECIDE_VALIDATION"; id: string; ok: boolean; motif?: string }
  | { type: "MARK_NOTIFICATION_READ"; id: string }
  | { type: "WITHDRAW_VALIDATION"; id: string }
  | { type: "MOVE_JALON"; code: string; jalonId: string; to: number }
  | { type: "REMOVE_JALON"; code: string; jalonId: string }
  | { type: "ADD_DRAFT_JALON"; code: string; t: string; dur: number; req: string }
  | { type: "CANCEL_PLAN"; code: string }
  | { type: "SUBMIT_PLAN"; req: ValidationRequest }
  | {
      type: "UPDATE_BUDGET_CONSUMED";
      code: string;
      amount: string;
      at: string;
      comment?: string;
      file?: { name: string; size: string; url?: string };
    }
  | { type: "LOG_MESSAGE"; m: string }
  | { type: "BUMP" };

function cloneInnos(innos: Initiative[]): Initiative[] {
  return innos.map((i) => ({
    ...i,
    jalons: i.jalons.map((j) => ({ ...j, f: j.f.map((f) => ({ ...f })), coms: [...j.coms], difs: [...j.difs] })),
    bens: i.bens ? i.bens.map((b) => ({ ...b })) : i.bens,
    recos: i.recos ? i.recos.map((r) => ({ ...r, suivi: [...r.suivi], f: [...r.f] })) : i.recos,
    plan: i.plan ? { ...i.plan, items: i.plan.items.map((p) => ({ ...p })), changes: [...i.plan.changes] } : i.plan,
    bcHist: i.bcHist ? i.bcHist.map((h) => ({ ...h })) : i.bcHist,
  }));
}

function notificationRecipients(req: ValidationRequest, innos: Initiative[]): string[] {
  const initiative = innos.find((x) => x.code === req.code);
  const candidates = req.role === "chef" && initiative ? [chefOf(initiative.dept)] : USERS.filter((u) => hasRole(u, req.role));
  return candidates.map((u) => u?.email || "").filter(Boolean);
}

function notificationsForValidation(req: ValidationRequest, innos: Initiative[]): Notification[] {
  return notificationRecipients(req, innos).map((email) => ({
    id: `VAL-${req.id}-${email.toLowerCase()}`,
    recipientEmail: email,
    type: "validation",
    message: `Demande de validation : ${req.label}`,
    initiativeCode: req.code,
    validationId: req.id,
    at: req.at,
    read: false,
  }));
}

function notificationForDecision(req: ValidationRequest, ok: boolean): Notification | null {
  if (!req.byEmail) return null;
  return {
    id: `DEC-${req.id}-${ok ? "OK" : "KO"}`,
    recipientEmail: req.byEmail,
    type: "validation",
    message: `${ok ? "Validation approuvée" : "Validation rejetée"} : ${req.label}${!ok && req.motif ? ` — ${req.motif}` : ""}`,
    initiativeCode: req.code,
    validationId: req.id,
    at: stamp(),
    read: false,
  };
}

function assignmentRecipient(value?: string): Utilisateur | undefined {
  const normalized = (value || "").trim().toLocaleLowerCase("fr");
  return USERS.find((user) => user.id.toLocaleLowerCase() === normalized || user.nom.trim().toLocaleLowerCase("fr") === normalized);
}

function assignmentNotification(initiative: Initiative, assignee: Utilisateur | undefined, activity: string, suffix: string): Notification | null {
  if (!assignee?.email) return null;
  return {
    id: `ASSIGN-${initiative.code}-${suffix}-${Date.now()}`,
    recipientEmail: assignee.email,
    type: "affectation",
    message: `Nouvelle activité attribuée : ${activity} · ${initiative.code} — ${initiative.titre}`,
    initiativeCode: initiative.code,
    at: stamp(),
    read: false,
    link: "?screen=actions",
  };
}

function reducer(state: State, action: Action): State {
  const human = (m: string): LogEntry => ({ at: stamp(), sys: false, who: SHORT[state.profile], m });
  const sysLog = (m: string): LogEntry => ({ at: stamp(), sys: true, m });

  switch (action.type) {
    case "COMMIT_STATE":
      return action.state;

    case "HYDRATE_SHAREPOINT":
      return { ...state, innos: cloneInnos(action.innos), log: action.log, vals: action.vals, notifications: action.notifications, vSeq: action.vals.length, tick: state.tick + 1 };

    case "SET_PROFILE":
      return { ...state, profile: action.profile };

    case "SET_IDENTITY":
      return { ...state, me: action.me, profile: action.me.prof, viewAsDept: null };

    case "SET_VIEW_AS_DEPT":
      return { ...state, viewAsDept: action.dept };

    case "BUMP":
      return { ...state, tick: state.tick + 1 };

    case "LOG_MESSAGE":
      return { ...state, log: [human(action.m), ...state.log] };

    case "CLOSE_JALON": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      const j = i?.jalons.find((x) => x.id === action.jalonId);
      if (!i || !j) return state;
      j.st = "valide";
      j.fin = action.fin;
      const log = [...state.log];
      if (j.charte && isProj(i) && !i.charteAt) {
        i.charteAt = j.fin;
        log.unshift(sysLog(`${i.code} · Charte de projet validée le ${j.fin} : indicateur « Charte validée » activé dans le portefeuille.`));
      }
      if (!isReco(i) && i.jalons.every((x) => x.st === "valide") && normBens(i).length) {
        log.unshift(sysLog(`${i.code} · Clôturé : mesure des ${i.bens!.length} bénéfice(s) attendu(s) demandée à ${suivi(i)}, relance à la date de mesure prévue.`));
      }
      const g = days(d(j.due), d(j.fin));
      const gt = g > 0 ? `${g} j de retard` : g < 0 ? `${-g} j d'avance` : "à la date prévue";
      log.unshift(sysLog(`${i.code} · Avancement recalculé : ${prog(i)} %. Porteur et responsable métier (${suivi(i)}) notifiés.`));
      log.unshift(human(`${i.code} · Étape « ${j.t} » clôturée · fin réelle ${j.fin} (${gt}).`));
      return { ...state, innos, log };
    }

    case "ASK_COMPLEMENT": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      const j = i?.jalons.find((x) => x.id === action.jalonId);
      if (!i || !j) return state;
      j.st = "complement";
      const log = [...state.log];
      log.unshift(sysLog(`${i.code} · Demande de complément transmise au porteur (${i.porteur}), copie à ${suivi(i)} (responsable métier), relance programmée à J+3.`));
      log.unshift(human(`${i.code} · Complément demandé sur « ${j.t} » : ${action.motif}`));
      return { ...state, innos, log };
    }

    case "ADD_NOTE": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      const j = i?.jalons.find((x) => x.id === action.jalonId);
      if (!i || !j) return state;
      const arr = action.kind === "com" ? j.coms : j.difs;
      arr.push({ at: iso(TODAY), txt: action.txt });
      return { ...state, innos };
    }

    case "ADD_FILES": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      const j = i?.jalons.find((x) => x.id === action.jalonId);
      if (!i || !j) return state;
      action.files.forEach((f) => j.f.push({ n: f.name, s: f.size, at: iso(TODAY), ok: false, url: f.url }));
      const log = [...state.log];
      const n = action.files.length;
      log.unshift(human(`${i.code} · ${n} document${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""} dans l'étape « ${j.t} ».`));
      return { ...state, innos, log };
    }

    case "CONFIRM_FILE": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      const j = i?.jalons.find((x) => x.id === action.jalonId);
      if (!i || !j) return state;
      const f = j.f.find((x) => x.n === action.fileName && !x.ok);
      if (!f) return state;
      f.ok = true;
      const log = [...state.log];
      log.unshift(sysLog(`${i.code} · « ${f.n} » contrôlé et rattaché à l'étape « ${j.t} ».`));
      if (j.st === "a_venir" || j.st === "complement") {
        j.st = "a_valider";
        log.unshift(sysLog(`${i.code} · Étape « ${j.t} » placée dans votre file de validation.`));
      }
      return { ...state, innos, log };
    }

    case "CREATE_INITIATIVE": {
      const inno = action.inno;
      const innos = [...cloneInnos(state.innos), inno];
      const log = [...state.log];
      const nDocs = inno.jalons.reduce((a, j) => a + j.f.length, 0);
      const lastJalon = inno.jalons[inno.jalons.length - 1];
      log.unshift(sysLog(`${inno.code} · Rattaché au département ${deptName(inno.dept)} (porteur : ${inno.porteur}) ; visible dans la vue du département et par son chef.`));
      if (inno.bens && inno.bens.length) {
        log.unshift(sysLog(`${inno.code} · ${inno.bens.length} bénéfice(s) attendu(s) enregistré(s), mesure programmée pour le ${fmtY(inno.bens[0].dmes)}.`));
      }
      if (nDocs) {
        log.unshift(sysLog(`${inno.code} · ${nDocs} document(s) importé(s) à la création, contrôlés et rattachés à leurs étapes.`));
      }
      log.unshift(sysLog(`${inno.code} · Planning prévisionnel généré (${typeLbl(inno)}) : ${inno.jalons.length} étapes, fin prévue le ${fmtY(lastJalon.due)}.`));
      log.unshift(sysLog(`${inno.code} · Relances J-5, escalade des retards et difficultés adressées à ${inno.porteur} (porteur) et ${inno.metier || inno.porteur} (responsable métier) pour les ${inno.jalons.length} échéances.`));
      log.unshift(human(`${inno.code} · « ${inno.titre} » créé par vous.`));
      const assigned = assignmentNotification(inno, assignmentRecipient(inno.porteurId), `Pilotage de l’initiative « ${inno.titre} »`, "PORTEUR");
      return { ...state, innos, log, notifications: assigned ? [assigned, ...state.notifications] : state.notifications };
    }

    case "DELETE_INITIATIVE": {
      const target = state.innos.find((x) => x.code === action.code);
      if (!target || state.vals.some((v) => v.code === action.code && v.st === "attente")) return state;
      const log = [...state.log];
      log.unshift(human(`${target.code} · « ${target.titre} » supprimée par l'administrateur fonctionnel.`));
      return {
        ...state,
        innos: state.innos.filter((x) => x.code !== action.code),
        vals: state.vals.filter((v) => v.code !== action.code),
        notifications: state.notifications.filter((n) => n.initiativeCode !== action.code),
        log,
      };
    }

    case "ADD_RECO": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      if (!i) return state;
      normRecos(i).push(action.reco);
      const log = [...state.log];
      log.unshift(human(`${i.code} · Recommandation ajoutée : ${action.reco.txt}`));
      const assigned = assignmentNotification(i, assignmentRecipient(action.reco.resp), action.reco.txt, action.reco.id);
      return { ...state, innos, log, notifications: assigned ? [assigned, ...state.notifications] : state.notifications };
    }

    case "UPDATE_RECO": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      const r = i && normRecos(i).find((x) => x.id === action.recoId);
      if (!i || !r) return state;
      const previousResponsible = r.resp;
      Object.assign(r, action.patch);
      const reassigned = action.patch.resp && action.patch.resp !== previousResponsible
        ? assignmentNotification(i, assignmentRecipient(action.patch.resp), r.txt, `${r.id}-REASSIGN`)
        : null;
      return { ...state, innos, notifications: reassigned ? [reassigned, ...state.notifications] : state.notifications };
    }

    case "ADD_RECO_SUIVI": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      const r = i && normRecos(i).find((x) => x.id === action.recoId);
      if (!i || !r) return state;
      r.suivi.push({ at: iso(TODAY), txt: action.txt });
      return { ...state, innos };
    }

    case "ADD_RECO_FILE": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      const r = i && normRecos(i).find((x) => x.id === action.recoId);
      if (!i || !r) return state;
      r.f.push({ n: action.file.name, s: action.file.size, at: iso(TODAY), ok: true, url: action.file.url });
      return { ...state, innos };
    }

    case "ADD_BENEFIT": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      if (!i) return state;
      normBens(i).push(action.ben);
      const log = [...state.log];
      log.unshift(sysLog(`${i.code} · Mesure du bénéfice « ${action.ben.lib} » programmée à la clôture.`));
      log.unshift(human(`${i.code} · Bénéfice attendu ajouté : ${action.ben.lib}.`));
      return { ...state, innos, log };
    }

    case "UPDATE_BENEFIT": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      const b = i && normBens(i).find((x) => x.id === action.benId);
      if (!i || !b) return state;
      Object.assign(b, action.patch);
      const log = [...state.log];
      if (action.patch.val !== undefined) {
        b.mesAt = action.patch.val ? iso(TODAY) : "";
        log.unshift(human(`${i.code} · Bénéfice « ${b.lib} » mesuré : ${action.patch.val ? action.patch.val + " " + b.unit : "mesure effacée"}.`));
        log.unshift(sysLog(`${i.code} · Mesure transmise à ${suivi(i)} (responsable métier) et ajoutée au rapport du Comité.`));
      }
      return { ...state, innos, log };
    }

    case "REQUEST_VALIDATION": {
      const log = [...state.log];
      log.unshift(sysLog(`${action.req.code} · Demande de validation « ${VRULES[action.req.kind].lbl} » transmise.`));
      log.unshift(human(`${action.req.code} · ${action.req.label} soumis à validation.`));
      let innos = state.innos;
      if (action.req.kind === "budget" || action.req.kind === "rattach" || action.req.kind === "suspension" || action.req.kind === "abandon" || action.req.kind === "retrait_ben") {
        innos = cloneInnos(state.innos);
        const i = innos.find((x) => x.code === action.req.code);
        if (i) {
          if (action.req.kind === "budget") i.bvPend = String(action.req.payload.to);
          if (action.req.kind === "rattach") i.ratPend = action.req.payload as { pil: string; prog: string };
          if (action.req.kind === "suspension") i.suspPend = true;
          if (action.req.kind === "abandon") i.abandonPend = true;
          if (action.req.kind === "retrait_ben") {
            const benefit = (i.bens || []).find((item) => item.id === action.req.payload.bid);
            if (benefit) benefit.pendDel = action.req.id;
          }
        }
      } else if (action.req.kind === "retrait_doc") {
        innos = cloneInnos(state.innos);
        const i = innos.find((x) => x.code === action.req.code);
        const j = i?.jalons.find((x) => x.id === action.req.payload.jalonId);
        const f = j?.f.find((x) => x.n === action.req.payload.fileName);
        if (f) f.pendDel = action.req.id;
      } else if (action.req.kind === "reco_abandon") {
        innos = cloneInnos(state.innos);
        const i = innos.find((x) => x.code === action.req.code);
        const rec = i?.recos?.find((x) => x.id === action.req.payload.recoId);
        if (rec) rec.abandonPend = true;
      }
      if (action.req.kind === "initiative_edit") {
        innos = cloneInnos(state.innos);
        const i = innos.find((x) => x.code === action.req.code);
        if (i) (i as Initiative & { editPend?: string }).editPend = action.req.id;
      }
      const notifications = [...notificationsForValidation(action.req, innos), ...state.notifications.filter((n) => n.validationId !== action.req.id)];
      return { ...state, innos, vals: [action.req, ...state.vals], notifications, vSeq: state.vSeq + 1, log };
    }

    case "DECIDE_VALIDATION": {
      const r = state.vals.find((x) => x.id === action.id);
      if (!r || r.st !== "attente") return state;
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === r.code);
      const vals = state.vals.map((x) =>
        x.id === r.id ? { ...x, st: action.ok ? ("approuvee" as const) : ("rejetee" as const), decAt: iso(TODAY), decBy: SHORT[state.profile], motif: action.motif || "" } : x
      );
      const log = [...state.log];
      const decisionNotification = notificationForDecision({ ...r, motif: action.motif || "" }, action.ok);
      let notifications = decisionNotification
        ? [decisionNotification, ...state.notifications.filter((n) => n.id !== decisionNotification.id)]
        : state.notifications;
      if (i) {
        if (r.kind === "initiative_edit") {
          if (action.ok) {
            const patch = r.payload.patch as Partial<Initiative>;
            const porteurChanged = !!patch.porteurId && patch.porteurId !== i.porteurId;
            Object.assign(i, patch);
            if (porteurChanged) {
              const assigned = assignmentNotification(i, assignmentRecipient(patch.porteurId), `Pilotage de l’initiative « ${i.titre} »`, "NOUVEAU-PORTEUR");
              if (assigned) notifications = [assigned, ...notifications];
            }
          }
          delete (i as Initiative & { editPend?: string }).editPend;
        }
        if (r.kind === "budget") {
          if (action.ok) i.bv = String(r.payload.to);
          delete i.bvPend;
        }
        if (r.kind === "rattach") {
          if (action.ok) {
            i.pil = r.payload.pil as string;
            i.prog = r.payload.prog as string;
          }
          delete i.ratPend;
        }
        if (r.kind === "suspension") {
          if (action.ok) {
            if (r.payload.resume) {
              delete i.susp;
              log.unshift(sysLog(`${i.code} · Initiative reprise : relances et escalades réactivées.`));
            } else {
              i.susp = { at: iso(TODAY), motif: r.payload.motif as string };
              log.unshift(sysLog(`${i.code} · Initiative suspendue : relances et escalades arrêtées jusqu'à la reprise.`));
            }
          }
          delete i.suspPend;
        }
        if (r.kind === "retrait_ben") {
          const b = (i.bens || []).find((x) => x.id === r.payload.bid);
          if (b) {
            if (action.ok) i.bens = (i.bens || []).filter((x) => x !== b);
            else delete b.pendDel;
          }
        }
        if (r.kind === "abandon") {
          if (action.ok) {
            i.abandoned = { at: iso(TODAY), motif: r.payload.motif as string };
            log.unshift(sysLog(`${i.code} · Initiative marquée abandonnée : relances et escalades arrêtées.`));
          }
          delete i.abandonPend;
        }
        if (r.kind === "retrait_doc") {
          const j = i.jalons.find((x) => x.id === r.payload.jalonId);
          const f = j?.f.find((x) => x.n === r.payload.fileName);
          if (f) {
            if (action.ok && j) j.f = j.f.filter((x) => x !== f);
            else delete f.pendDel;
          }
        }
        if (r.kind === "reco_abandon") {
          const rec = (i.recos || []).find((x) => x.id === r.payload.recoId);
          if (rec) {
            if (action.ok) rec.st = "abandonnee";
            delete rec.abandonPend;
          }
        }
        if (r.kind === "delais" && i.plan) {
          if (action.ok) {
            i.jalons = i.plan.items.map((p) => {
              if (p.isNew) {
                const st = p.due < iso(TODAY) ? "en_retard" : "a_venir";
                return { id: p.id, t: p.t, due: p.due, dur: p.dur, st, req: p.req, f: [], coms: [], difs: [], isNew: true } as Jalon;
              }
              const o = i.jalons.find((x) => x.id === p.id)!;
              if (o.st !== "valide") {
                o.due = p.due;
                o.dur = p.dur;
                if (o.st === "en_retard" && o.due >= iso(TODAY)) o.st = "a_venir";
                else if (o.st === "a_venir" && o.due < iso(TODAY) && !o.f.length) o.st = "en_retard";
              }
              return o;
            });
          }
          delete i.plan;
        }
        log.unshift(human(`${i.code} · « ${VRULES[r.kind].lbl} » ${action.ok ? "approuvée" : "rejetée"}${action.motif ? ` : ${action.motif}` : ""}.`));
        if (action.ok) log.unshift(sysLog(`${i.code} · Modification appliquée, indicateurs mis à jour ; demandeur informé.`));
        else log.unshift(sysLog(`${i.code} · Demandeur informé du rejet.`));
      }
      return { ...state, innos, vals, notifications, log };
    }

    case "MARK_NOTIFICATION_READ": {
      const notification = state.notifications.find((x) => x.id === action.id);
      if (!notification || notification.read) return state;
      const notifications = state.notifications.map((x) => x.id === action.id ? { ...x, read: true, readAt: stamp(), readerEmail: state.me.email } : x);
      return { ...state, notifications };
    }

    case "WITHDRAW_VALIDATION": {
      const r = state.vals.find((x) => x.id === action.id);
      if (!r || r.st !== "attente") return state;
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === r.code);
      const vals = state.vals.map((x) => (x.id === r.id ? { ...x, st: "retiree" as const, decAt: iso(TODAY), decBy: SHORT[state.profile] } : x));
      const log = [...state.log];
      if (i) {
        if (r.kind === "budget") delete i.bvPend;
        if (r.kind === "rattach") delete i.ratPend;
        if (r.kind === "suspension") delete i.suspPend;
        if (r.kind === "abandon") delete i.abandonPend;
        if (r.kind === "retrait_ben") {
          const b = (i.bens || []).find((x) => x.id === r.payload.bid);
          if (b) delete b.pendDel;
        }
        if (r.kind === "retrait_doc") {
          const j = i.jalons.find((x) => x.id === r.payload.jalonId);
          const f = j?.f.find((x) => x.n === r.payload.fileName);
          if (f) delete f.pendDel;
        }
        if (r.kind === "reco_abandon") {
          const rec = (i.recos || []).find((x) => x.id === r.payload.recoId);
          if (rec) delete rec.abandonPend;
        }
        if (r.kind === "delais") delete i.plan;
        log.unshift(human(`${i.code} · « ${VRULES[r.kind].lbl} » retirée avant décision.`));
      }
      return { ...state, innos, vals, log };
    }

    case "MOVE_JALON": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      if (!i) return state;
      moveJalonInPlan(i, action.jalonId, action.to);
      return { ...state, innos };
    }

    case "REMOVE_JALON": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      if (!i) return state;
      removeJalonFromPlan(i, action.jalonId);
      return { ...state, innos };
    }

    case "ADD_DRAFT_JALON": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      if (!i || i.plan?.reqId) return state;
      addDraftJalonToPlan(i, action.t, action.dur, action.req);
      return { ...state, innos };
    }

    case "CANCEL_PLAN": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      if (!i) return state;
      delete i.plan;
      return { ...state, innos };
    }

    case "SUBMIT_PLAN": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.req.code);
      if (i?.plan) i.plan.reqId = action.req.id;
      const log = [...state.log];
      log.unshift(sysLog(`${action.req.code} · Demande de validation « ${VRULES.delais.lbl} » transmise.`));
      log.unshift(human(`${action.req.code} · ${action.req.label} soumis à validation.`));
      const notifications = [...notificationsForValidation(action.req, innos), ...state.notifications.filter((n) => n.validationId !== action.req.id)];
      return { ...state, innos, vals: [action.req, ...state.vals], notifications, vSeq: state.vSeq + 1, log };
    }

    case "UPDATE_BUDGET_CONSUMED": {
      const innos = cloneInnos(state.innos);
      const i = innos.find((x) => x.code === action.code);
      if (!i) return state;
      const before = budPct(i);
      const log = [...state.log];
      log.unshift(human(`${i.code} · Budget consommé arrêté au ${action.at} : ${fmtXAF(i.bc)} → ${fmtXAF(action.amount)}${action.comment ? ` — ${action.comment}` : ""}.`));
      const update: BudgetUpdate = {
        at: action.at,
        v: action.amount,
        comment: action.comment,
        file: action.file ? { n: action.file.name, s: action.file.size, at: iso(TODAY), ok: true, url: action.file.url } : undefined,
      };
      i.bc = action.amount;
      i.bcHist = [update, ...(i.bcHist || [])];
      const pc = budPct(i);
      if (pc != null && pc > 100 && !(before != null && before > 100)) {
        log.unshift(sysLog(`${i.code} · Dépassement du budget validé signalé à ${suivi(i)} (responsable métier) et au chef de département.`));
      } else if (pc != null && pc >= 90 && !(before != null && before >= 90)) {
        log.unshift(sysLog(`${i.code} · 90 % du budget validé consommés : alerte envoyée à ${suivi(i)} et au chef de département.`));
      }
      return { ...state, innos, log };
    }

    default:
      return state;
  }
}

interface StoreValue {
  innos: Initiative[];
  /** Initiatives restreintes au périmètre département effectif (voir `scopeDept`) ; à utiliser pour toute vue opérationnelle. */
  scopedInnos: Initiative[];
  /** Journal filtré sur les initiatives visibles par l'utilisateur connecté. */
  scopedLog: LogEntry[];
  log: LogEntry[];
  profile: UserProfile;
  /** Identité réelle résolue via Office 365 (ou en lecture seule tant qu'elle ne l'est pas). */
  me: Utilisateur;
  /** Département effectivement appliqué comme restriction (null = aucune restriction). */
  scopeDept: string | null;
  /** Département simulé par un administrateur prévisualisant le profil « Chef de département ». */
  viewAsDept: string | null;
  /** Vrai si le sélecteur « voir en tant que » doit être proposé (administrateur réel, ou développement local). */
  canOverride: boolean;
  /** Vrai si le profil actif diverge de l'identité réelle résolue (prévisualisation en cours). */
  overridden: boolean;
  vals: ValidationRequest[];
  notifications: Notification[];
  tick: number;
  setProfile: (p: UserProfile) => void;
  setViewAsDept: (dept: string | null) => void;
  closeJalon: (code: string, jalonId: string, fin: string) => Promise<boolean>;
  sendComplement: (code: string, jalonId: string, motif: string) => Promise<boolean>;
  addNote: (code: string, jalonId: string, kind: "com" | "dif", txt: string) => Promise<boolean>;
  addFiles: (code: string, jalonId: string, files: UploadableFile[]) => Promise<boolean>;
  createInitiative: (inno: Initiative) => Promise<boolean>;
  deleteInitiative: (code: string) => Promise<boolean>;
  addReco: (code: string, data: { txt: string; resp?: string; ech?: string; obj?: string; dep?: string; cib?: string; unit?: string }) => void;
  updateReco: (code: string, recoId: string, patch: Partial<Recommandation>) => void;
  addRecoSuivi: (code: string, recoId: string, txt: string) => void;
  addRecoFile: (code: string, recoId: string, file: UploadableFile) => void;
  addBenefit: (code: string, ben: Omit<Benefice, "id" | "dmes"> & { dmes?: string }) => void;
  updateBenefit: (code: string, benId: string, patch: Partial<Benefice>) => void;
  requestBudgetChange: (i: Initiative, newBv: string) => void;
  requestInitiativeEdit: (i: Initiative, patch: Partial<Initiative>) => void;
  requestBenefitWithdrawal: (i: Initiative, ben: Benefice) => void;
  requestRattach: (i: Initiative, pil: string, prog: string) => void;
  requestSuspension: (i: Initiative, motif: string) => void;
  requestAbandon: (i: Initiative, motif: string) => void;
  requestFileWithdrawal: (i: Initiative, j: Jalon, file: FichierJoint) => Promise<boolean>;
  requestRecoAbandon: (i: Initiative, reco: Recommandation) => void;
  decideValidation: (id: string, ok: boolean, motif?: string) => void;
  markNotificationRead: (id: string) => void;
  withdrawValidation: (id: string) => void;
  moveJalon: (code: string, jalonId: string, to: number) => void;
  removeJalon: (code: string, jalonId: string) => void;
  addDraftJalon: (code: string, t: string, dur: number, req: string) => void;
  cancelPlan: (code: string) => void;
  submitPlan: (i: Initiative) => void;
  updateBudgetConsumed: (code: string, amount: string, at: string, comment?: string, file?: UploadableFile) => Promise<boolean>;
  logMessage: (m: string) => void;
  bump: () => void;
  toast: (msg: string, kind?: "info" | "error") => void;
  toastMsg: string | null;
  toastKind: "info" | "error";
  sharePointReady: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    innos: [],
    log: [],
    profile: UNRESOLVED.prof,
    me: UNRESOLVED,
    viewAsDept: null,
    vals: [],
    notifications: [],
    vSeq: 0,
    tick: 0,
  });
  const stateRef = useRef(state);
  const validationSeqRef = useRef(0);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<"info" | "error">("info");
  const [sharePointLoaded, setSharePointLoaded] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sharePointReady = useRef(false);
  const sharePointQueue = useRef(Promise.resolve());
  const toast = useCallback((msg: string, kind: "info" | "error" = "info") => {
    setToastMsg(msg);
    setToastKind(kind);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), kind === "error" ? 5000 : 3200);
  }, []);

  const nextValidationId = useCallback(() => {
    const currentMax = stateRef.current.vals.reduce((max, request) => {
      const match = request.id.match(/^V(\d+)$/i);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    validationSeqRef.current = Math.max(validationSeqRef.current, currentMax) + 1;
    return `V${validationSeqRef.current}`;
  }, []);

  const commitDirect = useCallback((
    action: Action,
    writer: (before: State, after: State) => Promise<void>,
    successMessage?: string,
  ): Promise<boolean> => {
    if (!sharePointReady.current) {
      toast("SharePoint n'est pas encore prêt : l'opération n'a pas été enregistrée", "error");
      return Promise.resolve(false);
    }

    const operation = sharePointQueue.current.then(async () => {
      const before = stateRef.current;
      const after = reducer(before, action);
      if (after === before) return false;

      await writer(before, after);
      const knownLogs = new Set(before.log.map((entry) => `${entry.at}|${entry.who || ""}|${entry.m}`));
      const newLogs = after.log.filter((entry) => !knownLogs.has(`${entry.at}|${entry.who || ""}|${entry.m}`));
      const knownNotifications = new Set(before.notifications.map((notification) => notification.id));
      const newNotifications = after.notifications.filter((notification) => !knownNotifications.has(notification.id));
      let logError: unknown = null;
      try {
        await Promise.all([
          ...newLogs.map((entry) => persistLogEntry(entry)),
          ...newNotifications.map((notification) => persistNotification(notification)),
        ]);

        // L'e-mail est envoyé seulement après confirmation de la notification SharePoint.
        // Une panne du flux ne doit jamais annuler l'affectation métier déjà enregistrée.
        const assignmentNotifications = newNotifications.filter((notification) => notification.type === "affectation");
        const mailResults = await Promise.allSettled(assignmentNotifications.map((notification) => sendAssignmentEmail(notification)));
        mailResults.forEach((result) => {
          if (result.status === "rejected") console.error("E-mail d'affectation non envoyé", result.reason);
        });
      } catch (error) {
        // Une notification ou le journal ne doit pas annuler l'écriture métier déjà confirmée.
        console.error("Journal ou notification SharePoint non enregistré", error);
        logError = error;
      }

      stateRef.current = after;
      dispatch({ type: "COMMIT_STATE", state: after });
      if (logError) {
        toast(`Opération enregistrée, mais journal ou notification indisponible : ${sharePointServiceHealth(logError)}`, "error");
      } else if (successMessage) {
        toast(successMessage);
      }
      return true;
    });

    sharePointQueue.current = operation.then(() => undefined).catch(() => undefined);
    return operation.catch((error) => {
      console.error("Écriture directe SharePoint échouée", error);
      toast(`Échec d'enregistrement SharePoint : ${sharePointServiceHealth(error)}`, "error");
      return false;
    });
  }, [toast]);

  const commitInitiativeAction = useCallback((
    action: Action,
    code: string,
    successMessage?: string,
    deleting = false,
  ): Promise<boolean> => {
    const current = stateRef.current;
    const existing = current.innos.find((item) => item.code === code);
    const allowed = !existing || current.profile === "admin" || current.profile === "dir" || existing.porteurId === current.me.id || (current.profile === "chef" && existing.dept === current.me.dept);
    if (!allowed) {
      toast("Vous n'êtes pas autorisé à consulter ou modifier cette initiative", "error");
      return Promise.resolve(false);
    }
    return commitDirect(action, async (_before, after) => {
    if (deleting) {
      await deleteInitiativeSnapshot(code);
      return;
    }
    const initiative = after.innos.find((item) => item.code === code);
    if (!initiative) throw new Error(`Initiative ${code} introuvable après modification`);
    await persistInitiativeSnapshot(initiative);
    }, successMessage);
  }, [commitDirect, toast]);

  const commitValidationRequest = useCallback((
    action: Extract<Action, { type: "REQUEST_VALIDATION" | "SUBMIT_PLAN" }>,
    request: ValidationRequest,
    successMessage: string,
  ): Promise<boolean> => commitDirect(action, async (before, after) => {
    const requestNotifications = after.notifications.filter((notification) => notification.validationId === request.id);
    await persistValidationRequest(request, requestNotifications);
    const beforeInitiative = before.innos.find((item) => item.code === request.code);
    const afterInitiative = after.innos.find((item) => item.code === request.code);
    if (afterInitiative && JSON.stringify(beforeInitiative) !== JSON.stringify(afterInitiative)) {
      await persistInitiativeSnapshot(afterInitiative);
    }
  }, successMessage), [commitDirect]);

  useEffect(() => {
    loadSharePointSnapshot().then((snapshot) => {
      if (snapshot) {
        DEPTS.splice(0, DEPTS.length, ...snapshot.departments);
        DIRECTIONS.splice(0, DIRECTIONS.length, ...snapshot.directions);
        Object.keys(DIRECTION_DIRECTORS).forEach((key) => delete DIRECTION_DIRECTORS[key]);
        Object.assign(DIRECTION_DIRECTORS, snapshot.directionDirectors);
        USERS.splice(0, USERS.length, ...snapshot.users);
        PILIERS.splice(0, PILIERS.length, ...snapshot.pillars);
        PROGS.splice(0, PROGS.length, ...snapshot.programmes);
        if (snapshot.holidays.length) {
          HOLIDAYS.splice(0, HOLIDAYS.length, ...snapshot.holidays);
        }
        dispatch({ type: "HYDRATE_SHAREPOINT", innos: snapshot.initiatives, log: snapshot.log, vals: snapshot.validations, notifications: snapshot.notifications });
        sharePointReady.current = true;
        setSharePointLoaded(true);
      } else {
        toast("Aucune donnée SharePoint disponible : l'application reste vide", "error");
      }
      resolveIdentity().then((me) => dispatch({ type: "SET_IDENTITY", me }));
    }).catch((error) => {
      console.error("Chargement SharePoint impossible", error);
      toast(`Impossible de charger les données SharePoint : ${sharePointServiceHealth(error)}`, "error");
    });
  }, [toast]);

  // Les droits sont toujours ceux de l'identité Microsoft 365 rapprochée de 02_Utilisateurs.
  // Aucun profil ou département ne peut être simulé depuis l'interface.
  const canOverride = false;

  const setProfile = useCallback(
    (profile: UserProfile) => {
      if (!canOverride) return;
      dispatch({ type: "SET_PROFILE", profile });
    },
    [canOverride]
  );

  const setViewAsDept = useCallback(
    (dept: string | null) => {
      if (!canOverride) return;
      dispatch({ type: "SET_VIEW_AS_DEPT", dept });
    },
    [canOverride]
  );

  const overridden = false;

  const scopeDept = useMemo<string | null>(() => {
    if (state.profile !== "chef" && state.profile !== "contrib") return null;
    const dept = overridden ? state.viewAsDept : state.me.dept;
    return dept || null;
  }, [state.profile, overridden, state.me.dept, state.viewAsDept]);

  const scopedInnos = useMemo<Initiative[]>(
    () => {
      if (state.profile === "admin") return state.innos;
      if (!state.me.id) return [];
      if (state.profile === "dir") {
        const managedDirections = new Set(Object.entries(DIRECTION_DIRECTORS)
          .filter(([, directorId]) => directorId === state.me.id)
          .map(([direction]) => direction));
        const managedDepartments = new Set(DEPTS.filter((department) => managedDirections.has(department.dir || "")).map((department) => department.id));
        return state.innos.filter((initiative) => managedDepartments.has(initiative.dept || ""));
      }
      return state.innos.filter((i) => {
        const isCreator = i.porteurId === state.me.id;
        const isDepartmentChief = state.profile === "chef" && !!state.me.dept && i.dept === state.me.dept;
        return isCreator || isDepartmentChief;
      });
    },
    [state.innos, state.profile, state.me.id, state.me.dept]
  );

  const scopedLog = useMemo<LogEntry[]>(() => {
    const visibleCodes = new Set(scopedInnos.map((i) => i.code));
    return state.log.filter((entry) => {
      const code = entry.m.match(/^(INI-\d+)/)?.[1];
      return !code || visibleCodes.has(code);
    });
  }, [state.log, scopedInnos]);

  const bump = useCallback(() => dispatch({ type: "BUMP" }), []);
  const logMessage = useCallback((m: string) => {
    void commitDirect({ type: "LOG_MESSAGE", m }, async () => undefined);
  }, [commitDirect]);

  const closeJalon = useCallback(async (code: string, jalonId: string, fin: string): Promise<boolean> => {
    return commitInitiativeAction(
      { type: "CLOSE_JALON", code, jalonId, fin },
      code,
      "Clôture enregistrée et confirmée dans SharePoint",
    );
  }, [commitInitiativeAction]);

  const sendComplement = useCallback((code: string, jalonId: string, motif: string) =>
    commitInitiativeAction({ type: "ASK_COMPLEMENT", code, jalonId, motif }, code, "Demande de complément enregistrée dans SharePoint"),
  [commitInitiativeAction]);

  const addNote = useCallback((code: string, jalonId: string, kind: "com" | "dif", txt: string) =>
    commitInitiativeAction({ type: "ADD_NOTE", code, jalonId, kind, txt }, code, kind === "com" ? "Commentaire enregistré dans SharePoint" : "Difficulté enregistrée dans SharePoint"),
  [commitInitiativeAction]);

  const addFiles = useCallback(
    async (code: string, jalonId: string, files: UploadableFile[]): Promise<boolean> => {
      const uploaded: { file: UploadableFile; result: Awaited<ReturnType<typeof uploadFileToSharePoint>> }[] = [];
      const folderPath = sharePointFolderPath("Projets", code, "Jalons", jalonId, stateRef.current.me.email || "Application Cap Innovation");
      for (const file of files) {
        try {
          const result = await uploadFileToSharePoint(
            file,
            Date.now(),
            stateRef.current.me.email || "Application Cap Innovation",
            folderPath,
          );
          uploaded.push({ file, result });
        } catch (error) {
          console.error("Dépôt du fichier impossible", error);
          toast(`Échec du dépôt de « ${file.name} » dans SharePoint`, "error");
        }
      }
      if (!uploaded.length) return false;
      const metadata = uploaded.map(({ file, result }) => ({ name: file.name, size: file.size, url: uploadedFileUrl(folderPath, file.name, result) }));
      const saved = await commitInitiativeAction(
        { type: "ADD_FILES", code, jalonId, files: metadata },
        code,
        `${metadata.length} document${metadata.length > 1 ? "s" : ""} enregistré${metadata.length > 1 ? "s" : ""} dans SharePoint · contrôle en cours`,
      );
      if (!saved) return false;
      metadata.forEach((file) => {
        setTimeout(() => {
          void commitInitiativeAction({ type: "CONFIRM_FILE", code, jalonId, fileName: file.name }, code);
        }, 1400);
      });
      return true;
    },
    [commitInitiativeAction, toast]
  );

  const createInitiative = useCallback((inno: Initiative): Promise<boolean> =>
    commitInitiativeAction({ type: "CREATE_INITIATIVE", inno }, inno.code, `${inno.code} créé et confirmé dans SharePoint`),
  [commitInitiativeAction]);

  const deleteInitiative = useCallback((code: string): Promise<boolean> => {
    if (!sharePointReady.current) {
      toast("SharePoint n'est pas encore prêt : l'opération n'a pas été enregistrée", "error");
      return Promise.resolve(false);
    }
    const current = stateRef.current;
    if (current.profile !== "admin") {
      toast("Suppression réservée à l'administrateur fonctionnel");
      return Promise.resolve(false);
    }
    if (current.vals.some((v) => v.code === code && v.st === "attente")) {
      toast("Impossible de supprimer une initiative avec une validation en attente");
      return Promise.resolve(false);
    }
    return commitInitiativeAction({ type: "DELETE_INITIATIVE", code }, code, "Initiative supprimée de SharePoint", true);
  }, [commitInitiativeAction, toast]);

  const addReco = useCallback(
      (code: string, data: { txt: string; resp?: string; ech?: string; obj?: string; dep?: string; cib?: string; unit?: string }) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : l'opération n'a pas été enregistrée", "error");
      const i = stateRef.current.innos.find((x) => x.code === code);
      const n = (i?.recos?.length || 0) + 1;
      const reco: Recommandation = {
        id: `${code}-R${n}`,
        at: iso(TODAY),
        txt: data.txt,
        resp: data.resp || "",
        ech: data.ech || "",
        st: "a_lancer",
        obj: data.obj,
        dep: data.dep,
        cib: data.cib,
        unit: data.unit,
        suivi: [],
        f: [],
      };
      return commitInitiativeAction({ type: "ADD_RECO", code, reco }, code, "Recommandation enregistrée dans SharePoint");
    },
    [commitInitiativeAction, toast]
  );
  const updateReco = useCallback((code: string, recoId: string, patch: Partial<Recommandation>) =>
    commitInitiativeAction({ type: "UPDATE_RECO", code, recoId, patch }, code), [commitInitiativeAction]);
  const addRecoSuivi = useCallback((code: string, recoId: string, txt: string) =>
    commitInitiativeAction({ type: "ADD_RECO_SUIVI", code, recoId, txt }, code, "Point de suivi enregistré dans SharePoint"), [commitInitiativeAction]);
  const addRecoFile = useCallback(async (code: string, recoId: string, file: UploadableFile) => {
    const folderPath = sharePointFolderPath("Projets", code, "Recommandations", recoId, stateRef.current.me.email || "Application Cap Innovation");
    try {
      const result = await uploadFileToSharePoint(
        file,
        Date.now(),
        stateRef.current.me.email || "Application Cap Innovation",
        folderPath,
      );
      const { name, size } = file;
      return commitInitiativeAction({ type: "ADD_RECO_FILE", code, recoId, file: { name, size, url: uploadedFileUrl(folderPath, name, result) } }, code, "Document de recommandation enregistré dans SharePoint");
    } catch (error) {
      console.error("Dépôt du justificatif impossible", error);
      toast(`Échec du dépôt de « ${file.name} » dans SharePoint`, "error");
      return false;
    }
  }, [commitInitiativeAction, toast]);

  const addBenefit = useCallback(
    (code: string, ben: Omit<Benefice, "id" | "dmes"> & { dmes?: string }) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : l'opération n'a pas été enregistrée", "error");
      const i = stateRef.current.innos.find((x) => x.code === code);
      const n = (i?.bens?.length || 0) + 1;
      const dmes = ben.dmes || (i ? addMonths(endOf(i), 3) : iso(TODAY));
      return commitInitiativeAction({ type: "ADD_BENEFIT", code, ben: { id: `${code}-B${n}`, lib: ben.lib, dep: ben.dep, cib: ben.cib, unit: ben.unit, dmes } }, code, "Bénéfice enregistré dans SharePoint");
    },
    [commitInitiativeAction, toast]
  );

  const updateBenefit = useCallback((code: string, benId: string, patch: Partial<Benefice>) =>
    commitInitiativeAction({ type: "UPDATE_BENEFIT", code, benId, patch }, code), [commitInitiativeAction]);

  const requestBudgetChange = useCallback(
    (i: Initiative, newBv: string) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la demande n'a pas été enregistrée", "error");
      const vSeqNow = nextValidationId();
      const req: ValidationRequest = {
        id: "V" + vSeqNow,
        kind: "budget",
        role: VRULES.budget.role,
        code: i.code,
        label: `Budget validé : ${fmtM(i.bv)} → ${fmtM(newBv)}`,
        lines: [`Ancien budget : ${fmtM(i.bv)} XAF`, `Nouveau budget : ${fmtM(newBv)} XAF`],
        payload: { to: newBv },
        by: SHORT[state.profile],
        byEmail: state.me.email || undefined,
        at: iso(TODAY),
        st: "attente",
      };
      void commitValidationRequest({ type: "REQUEST_VALIDATION", req }, req, "Demande de modification du budget enregistrée dans SharePoint");
    },
    [state.profile, state.me.email, commitValidationRequest, nextValidationId, toast]
  );

  const requestInitiativeEdit = useCallback(
    (i: Initiative, patch: Partial<Initiative>) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la demande n'a pas été enregistrée", "error");
      const allowed = state.profile === "admin" || state.profile === "dir" || i.porteurId === state.me.id || (state.profile === "chef" && i.dept === state.me.dept);
      if (!allowed) return toast("Seul l'initiateur, le Chef de département ou un administrateur peut modifier cette initiative", "error");
      const fmtVal = (key: string, value: unknown): string => {
        if (key === "pil") return refLbl(pilOf(value as string | undefined));
        if (key === "prog") return refLbl(progOf(value as string | undefined));
        return String(value || "—");
      };
      const changes = Object.entries(patch).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => `${key} : ${fmtVal(key, (i as unknown as Record<string, unknown>)[key])} → ${fmtVal(key, value)}`);
      if (!changes.length) return toast("Aucune modification à soumettre");
      const req: ValidationRequest = {
        id: nextValidationId(), kind: "initiative_edit", role: VRULES.initiative_edit.role, code: i.code,
        label: `Modification de « ${i.titre} »`, lines: changes, payload: { patch }, by: SHORT[state.profile],
        byEmail: state.me.email || undefined, at: iso(TODAY), st: "attente",
      };
      void commitValidationRequest({ type: "REQUEST_VALIDATION", req }, req, "Modification de l'initiative soumise au circuit de validation");
    },
    [state.profile, state.me.email, state.me.id, state.me.dept, commitValidationRequest, nextValidationId, toast]
  );

  const requestBenefitWithdrawal = useCallback(
    (i: Initiative, ben: Benefice) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la demande n'a pas été enregistrée", "error");
      const vSeqNow = nextValidationId();
      const req: ValidationRequest = {
        id: "V" + vSeqNow,
        kind: "retrait_ben",
        role: VRULES.retrait_ben.role,
        code: i.code,
        label: `Retrait du bénéfice « ${ben.lib} »`,
        lines: [`Cible : ${ben.cib} ${ben.unit}`, `Initiative : ${i.titre}`],
        payload: { bid: ben.id },
        by: SHORT[state.profile],
        byEmail: state.me.email || undefined,
        at: iso(TODAY),
        st: "attente",
      };
      void commitValidationRequest({ type: "REQUEST_VALIDATION", req }, req, "Retrait soumis et enregistré dans SharePoint");
    },
    [state.profile, state.me.email, commitValidationRequest, nextValidationId, toast]
  );

  const requestRattach = useCallback(
    (i: Initiative, pil: string, prog: string) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la demande n'a pas été enregistrée", "error");
      const vSeqNow = nextValidationId();
      const req: ValidationRequest = {
        id: "V" + vSeqNow,
        kind: "rattach",
        role: VRULES.rattach.role,
        code: i.code,
        label: `Rattachement stratégique de « ${i.titre} »`,
        lines: [`Pilier : ${refLbl(pilOf(i.pil))} → ${refLbl(pilOf(pil))}`, `Programme : ${refLbl(progOf(i.prog))} → ${refLbl(progOf(prog))}`],
        payload: { pil, prog },
        by: SHORT[state.profile],
        byEmail: state.me.email || undefined,
        at: iso(TODAY),
        st: "attente",
      };
      void commitValidationRequest({ type: "REQUEST_VALIDATION", req }, req, "Changement de rattachement enregistré dans SharePoint");
    },
    [state.profile, state.me.email, commitValidationRequest, nextValidationId, toast]
  );

  const requestSuspension = useCallback(
    (i: Initiative, motif: string) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la demande n'a pas été enregistrée", "error");
      const vSeqNow = nextValidationId();
      const resume = !!i.susp;
      const req: ValidationRequest = {
        id: "V" + vSeqNow,
        kind: "suspension",
        role: VRULES.suspension.role,
        code: i.code,
        label: `${resume ? "Reprise" : "Suspension"} de « ${i.titre} »`,
        lines: [`${resume ? "Reprise" : "Suspension"} demandée`, `Motif : ${motif}`, `Avancement à date : ${prog(i)} %`],
        payload: { resume, motif },
        by: SHORT[state.profile],
        byEmail: state.me.email || undefined,
        at: iso(TODAY),
        st: "attente",
      };
      void commitValidationRequest({ type: "REQUEST_VALIDATION", req }, req, "Demande enregistrée dans SharePoint et soumise au Directeur");
    },
    [state.profile, state.me.email, commitValidationRequest, nextValidationId, toast]
  );

  const requestAbandon = useCallback(
    (i: Initiative, motif: string) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la demande n'a pas été enregistrée", "error");
      const vSeqNow = nextValidationId();
      const req: ValidationRequest = {
        id: "V" + vSeqNow,
        kind: "abandon",
        role: VRULES.abandon.role,
        code: i.code,
        label: `Abandon de « ${i.titre} »`,
        lines: [`Motif : ${motif}`, `Avancement à date : ${prog(i)} %`],
        payload: { motif },
        by: SHORT[state.profile],
        byEmail: state.me.email || undefined,
        at: iso(TODAY),
        st: "attente",
      };
      void commitValidationRequest({ type: "REQUEST_VALIDATION", req }, req, "Demande d'abandon enregistrée dans SharePoint");
    },
    [state.profile, state.me.email, commitValidationRequest, nextValidationId, toast]
  );

  const requestFileWithdrawal = useCallback(
    (i: Initiative, j: Jalon, file: FichierJoint): Promise<boolean> => {
      if (!sharePointReady.current) {
        toast("SharePoint n'est pas encore prêt : la demande n'a pas été enregistrée", "error");
        return Promise.resolve(false);
      }
      const vSeqNow = nextValidationId();
      const req: ValidationRequest = {
        id: "V" + vSeqNow,
        kind: "retrait_doc",
        role: VRULES.retrait_doc.role,
        code: i.code,
        label: `Suppression de « ${file.n} »`,
        lines: [`Étape : ${j.t}`, `Document : ${file.n}`],
        payload: { jalonId: j.id, fileName: file.n },
        by: SHORT[state.profile],
        byEmail: state.me.email || undefined,
        at: iso(TODAY),
        st: "attente",
      };
      return commitValidationRequest({ type: "REQUEST_VALIDATION", req }, req, "Suppression du justificatif enregistrée dans SharePoint");
    },
    [state.profile, state.me.email, commitValidationRequest, nextValidationId, toast]
  );

  const requestRecoAbandon = useCallback(
    (i: Initiative, reco: Recommandation) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la demande n'a pas été enregistrée", "error");
      const vSeqNow = nextValidationId();
      const req: ValidationRequest = {
        id: "V" + vSeqNow,
        kind: "reco_abandon",
        role: VRULES.reco_abandon.role,
        code: i.code,
        label: `Abandon de la recommandation « ${reco.txt.slice(0, 60)} »`,
        lines: [`Recommandation : ${reco.txt}`],
        payload: { recoId: reco.id },
        by: SHORT[state.profile],
        byEmail: state.me.email || undefined,
        at: iso(TODAY),
        st: "attente",
      };
      void commitValidationRequest({ type: "REQUEST_VALIDATION", req }, req, "Abandon de la recommandation enregistré dans SharePoint");
    },
    [state.profile, state.me.email, commitValidationRequest, nextValidationId, toast]
  );

  const decideValidation = useCallback(
    (id: string, ok: boolean, motif?: string) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la décision n'a pas été enregistrée", "error");
      const current = stateRef.current.vals.find((x) => x.id === id && x.st === "attente");
      if (!current) return;
      const currentState = stateRef.current;
      const initiative = currentState.innos.find((item) => item.code === current.code);
      const inDepartment = current.role !== "chef" || (!!initiative && initiative.dept === currentState.me.dept);
      if (current.role !== currentState.profile || !inDepartment) {
        toast("Vous n'êtes pas autorisé à traiter cette demande de validation", "error");
        return;
      }
      void commitDirect({ type: "DECIDE_VALIDATION", id, ok, motif }, async (before, after) => {
        const decision = after.vals.find((request) => request.id === id);
        if (!decision) throw new Error(`Validation ${id} introuvable après décision`);
        await persistValidationDecision(decision);
        const notification = after.notifications.find((item) => item.id === `DEC-${id}-${ok ? "OK" : "KO"}`);
        if (notification) await persistNotification(notification);
        const beforeInitiative = before.innos.find((item) => item.code === current.code);
        const afterInitiative = after.innos.find((item) => item.code === current.code);
        if (afterInitiative && JSON.stringify(beforeInitiative) !== JSON.stringify(afterInitiative)) {
          await persistInitiativeSnapshot(afterInitiative);
        }
      }, "Validation, modification métier et notification confirmées dans SharePoint");
    },
    [commitDirect, toast]
  );

  const markNotificationRead = useCallback((id: string) => {
    if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la notification n'a pas été enregistrée", "error");
    const current = stateRef.current.notifications.find((notification) => notification.id === id);
    if (!current || current.read) return;
    void commitDirect({ type: "MARK_NOTIFICATION_READ", id }, async (_before, after) => {
      const updated = after.notifications.find((notification) => notification.id === id);
      if (!updated) throw new Error(`Notification ${id} introuvable`);
      await persistNotification(updated);
    });
  }, [commitDirect, toast]);

  const withdrawValidation = useCallback(
    (id: string) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : l'opération n'a pas été enregistrée", "error");
      const current = stateRef.current.vals.find((request) => request.id === id && request.st === "attente");
      if (!current) return;
      void commitDirect({ type: "WITHDRAW_VALIDATION", id }, async (before, after) => {
        const decision = after.vals.find((request) => request.id === id);
        if (!decision) throw new Error(`Validation ${id} introuvable après retrait`);
        await persistValidationDecision(decision);
        const beforeInitiative = before.innos.find((item) => item.code === current.code);
        const afterInitiative = after.innos.find((item) => item.code === current.code);
        if (afterInitiative && JSON.stringify(beforeInitiative) !== JSON.stringify(afterInitiative)) {
          await persistInitiativeSnapshot(afterInitiative);
        }
      }, "Demande retirée et enregistrée dans SharePoint");
    },
    [commitDirect, toast]
  );

  const moveJalon = useCallback(
    (code: string, jalonId: string, to: number) => {
      void commitInitiativeAction({ type: "MOVE_JALON", code, jalonId, to }, code, "Déplacement enregistré dans SharePoint · à soumettre à validation");
    },
    [commitInitiativeAction]
  );

  const removeJalon = useCallback(
    (code: string, jalonId: string) => {
      void commitInitiativeAction({ type: "REMOVE_JALON", code, jalonId }, code, "Retrait enregistré dans SharePoint · à soumettre à validation");
    },
    [commitInitiativeAction]
  );

  const addDraftJalon = useCallback(
    (code: string, t: string, dur: number, req: string) => {
      void commitInitiativeAction({ type: "ADD_DRAFT_JALON", code, t, dur, req }, code, "Jalon proposé enregistré dans SharePoint");
    },
    [commitInitiativeAction]
  );

  const cancelPlan = useCallback(
    (code: string) => {
      void commitInitiativeAction({ type: "CANCEL_PLAN", code }, code, "Replanification annulée dans SharePoint");
    },
    [commitInitiativeAction]
  );

  const submitPlan = useCallback(
    (i: Initiative) => {
      if (!sharePointReady.current) return toast("SharePoint n'est pas encore prêt : la replanification n'a pas été enregistrée", "error");
      if (!i.plan) return;
      const sh = planShiftDays(i);
      const role = planRole(i);
      const req: ValidationRequest = {
        id: nextValidationId(),
        kind: "delais",
        role,
        code: i.code,
        label: `Replanification de « ${i.titre} »`,
        lines: [...i.plan.changes, `Fin prévue : ${fmtY(i.plan.endBefore)} → ${fmtY(planEnd(i))} (${sh > 0 ? "+" : ""}${sh} j)`],
        payload: {},
        by: SHORT[state.profile],
        byEmail: state.me.email || undefined,
        at: iso(TODAY),
        st: "attente",
      };
      void commitValidationRequest({ type: "SUBMIT_PLAN", req }, req, `Replanification enregistrée dans SharePoint et soumise : ${role === "dir" ? "Directeur" : "Chef de département"}`);
    },
    [state.profile, state.me.email, commitValidationRequest, nextValidationId, toast]
  );

  const updateBudgetConsumed = useCallback(
    async (code: string, amount: string, at: string, comment?: string, file?: UploadableFile): Promise<boolean> => {
      if (!sharePointReady.current) {
        toast("SharePoint n'est pas encore prêt : l'opération n'a pas été enregistrée", "error");
        return false;
      }
      if (file) {
        const folderPath = sharePointFolderPath("Projets", code, "Budgets", stateRef.current.me.email || "Application Cap Innovation");
        try {
          const result = await uploadFileToSharePoint(
            file,
            Date.now(),
            stateRef.current.me.email || "Application Cap Innovation",
            folderPath,
          );
          const metadata = { name: file.name, size: file.size, url: uploadedFileUrl(folderPath, file.name, result) };
          return commitInitiativeAction({ type: "UPDATE_BUDGET_CONSUMED", code, amount, at, comment, file: metadata }, code, "Budget consommé enregistré dans SharePoint");
        } catch (error) {
          console.error("Dépôt de la pièce budgétaire impossible", error);
          toast(`Échec du dépôt de « ${file.name} » dans SharePoint`, "error");
          return false;
        }
      }
      return commitInitiativeAction({ type: "UPDATE_BUDGET_CONSUMED", code, amount, at, comment }, code, "Budget consommé enregistré dans SharePoint");
    },
    [commitInitiativeAction, toast]
  );

  const value = useMemo<StoreValue>(
    () => ({
      innos: state.innos,
      scopedInnos,
      scopedLog,
      log: state.log,
      profile: state.profile,
      me: state.me,
      scopeDept,
      viewAsDept: state.viewAsDept,
      canOverride,
      overridden,
      vals: state.vals,
      notifications: state.notifications,
      tick: state.tick,
      setProfile,
      setViewAsDept,
      closeJalon,
      sendComplement,
      addNote,
      addFiles,
      createInitiative,
      deleteInitiative,
      addReco,
      updateReco,
      addRecoSuivi,
      addRecoFile,
      addBenefit,
      updateBenefit,
      requestBudgetChange,
      requestInitiativeEdit,
      requestBenefitWithdrawal,
      requestRattach,
      requestSuspension,
      requestAbandon,
      requestFileWithdrawal,
      requestRecoAbandon,
      decideValidation,
      markNotificationRead,
      withdrawValidation,
      moveJalon,
      removeJalon,
      addDraftJalon,
      cancelPlan,
      submitPlan,
      updateBudgetConsumed,
      logMessage,
      bump,
      toast,
      toastKind,
      toastMsg,
      sharePointReady: sharePointLoaded,
    }),
    [
      state,
      scopedInnos,
      scopedLog,
      scopeDept,
      canOverride,
      overridden,
      setProfile,
      setViewAsDept,
      closeJalon,
      sendComplement,
      addNote,
      addFiles,
      createInitiative,
      deleteInitiative,
      addReco,
      updateReco,
      addRecoSuivi,
      addRecoFile,
      addBenefit,
      updateBenefit,
      requestBudgetChange,
      requestInitiativeEdit,
      requestBenefitWithdrawal,
      requestRattach,
      requestSuspension,
      requestAbandon,
      requestFileWithdrawal,
      requestRecoAbandon,
      decideValidation,
      markNotificationRead,
      withdrawValidation,
      moveJalon,
      removeJalon,
      addDraftJalon,
      cancelPlan,
      submitPlan,
      updateBudgetConsumed,
      logMessage,
      bump,
      toast,
      toastKind,
      toastMsg,
      sharePointLoaded,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function findJalon(innos: Initiative[], jalonId: string): { i: Initiative; j: Jalon } | null {
  for (const i of innos) {
    const j = i.jalons.find((x) => x.id === jalonId);
    if (j) return { i, j };
  }
  return null;
}

export function closeValidationError(i: Initiative, j: Jalon, finDraft: string): string {
  const completesEtude = isReco(i) && j.st !== "valide" && i.jalons.every((x) => x === j || x.st === "valide");
  if (completesEtude && !(i.recos && i.recos.length)) return `Renseignez au moins une recommandation avant de clôturer ${artOf(i)}.`;
  if (!j.f.length) return "Importez d'abord la pièce attendue : " + j.req + ".";
  if (j.f.some((f) => !f.ok)) return "Le contrôle du document est en cours, patientez un instant.";
  if (!finDraft) return "Indiquez la date de fin réelle de l'étape.";
  if (finDraft > iso(TODAY)) return "La date de fin réelle ne peut pas être dans le futur.";
  return "";
}

export function needsDecisionJalon(j: Jalon): boolean {
  return needsDecision(j);
}

export function fileNotOk(f: FichierJoint): boolean {
  return !f.ok;
}

export function charteBadge(i: Initiative): boolean {
  return charteOK(i);
}

export { endOf, numv };
