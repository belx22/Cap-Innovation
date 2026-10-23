import { Office365UsersService } from "../generated/services/Office365UsersService";
import { USERS } from "../data/reference";
import type { Utilisateur } from "../data/types";

/** Identité de repli : lecture seule, sans département, tant que l'utilisateur réel n'est pas résolu
 *  ou n'est rattaché à aucun Utilisateur par l'administrateur fonctionnel. */
export const UNRESOLVED: Utilisateur = { id: "", nom: "Utilisateur", dept: "", profils: ["contrib"], prof: "contrib" };

const SYSTEM_ADMIN_EMAILS = new Set(["agent_dri_03@afrilandfirstbank.com"]);

const normalizeEmail = (email?: string): string => (email || "").trim().toLowerCase();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/**
 * Résout l'identité réelle de l'utilisateur connecté via le connecteur Office 365 (Microsoft Graph /me),
 * puis la fait correspondre à un Utilisateur par adresse e-mail. Replie sur `UNRESOLVED` si l'appel échoue
 * (hors environnement Power Apps, par exemple en développement local) ou si l'e-mail ne correspond à aucun
 * Utilisateur géré par l'administrateur — l'interface seule ne suffisant pas, ce repli garantit un accès
 * minimal plutôt que d'hériter d'un profil trop large par défaut.
 */
export async function resolveIdentity(): Promise<Utilisateur> {
  try {
    const result = await withTimeout(Office365UsersService.MyProfile_V2("mail,userPrincipalName,displayName"), 5000);
    if (!result.success || !result.data) return UNRESOLVED;
    const email = normalizeEmail(result.data.mail || result.data.userPrincipalName);
    if (!email) return UNRESOLVED;
    const match = USERS.find((u) => normalizeEmail(u.email) === email);
    if (match) return match;
    if (SYSTEM_ADMIN_EMAILS.has(email)) {
      return { id: "U13", nom: result.data.displayName || "Agent DRI 03", email, dept: "", profils: ["admin"], prof: "admin" };
    }
    return { ...UNRESOLVED, nom: result.data.displayName || UNRESOLVED.nom };
  } catch {
    return UNRESOLVED;
  }
}

export interface DirectoryUser {
  id: string;
  displayName: string;
  mail: string;
}

/**
 * Recherche des comptes dans l'annuaire d'entreprise (Microsoft Graph, via le connecteur Office 365 Users
 * déjà configuré) par nom ou adresse e-mail, pour créer un Utilisateur sans ressaisir son identité.
 */
export async function searchDirectoryUsers(query: string): Promise<DirectoryUser[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  try {
    const result = await withTimeout(Office365UsersService.SearchUserV2(query, 8), 6000);
    if (!result.success || !result.data?.value) return [];
    return result.data.value
      .map((u) => {
        const mail = (u.Mail || u.UserPrincipalName || "").trim();
        return { id: u.Id, displayName: u.DisplayName || mail, mail };
      })
      .filter((u) => !!u.mail);
  } catch {
    return [];
  }
}
