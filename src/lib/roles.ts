import type { UserProfile, Utilisateur } from "../data/types";

/** Ordre utilisé lorsqu'un utilisateur possède plusieurs rôles. */
export const ROLE_PRIORITY: UserProfile[] = ["admin", "dir", "chef", "gest", "contrib"];

const roleSet = new Set<UserProfile>(ROLE_PRIORITY);

export function normalizeRoles(roles?: readonly string[], fallback: UserProfile = "contrib"): UserProfile[] {
  const unique = Array.from(new Set((roles || []).filter((role): role is UserProfile => roleSet.has(role as UserProfile))));
  return unique.length ? ROLE_PRIORITY.filter((role) => unique.includes(role)) : [fallback];
}

export function rolesFromSharePoint(value?: string): UserProfile[] {
  return normalizeRoles((value || "").split(/[;,|]/).map((role) => role.trim().toLowerCase()));
}

export function effectiveRole(roles?: readonly UserProfile[], fallback: UserProfile = "contrib"): UserProfile {
  return normalizeRoles(roles, fallback)[0];
}

export function rolesOf(user: Pick<Utilisateur, "prof" | "profils">): UserProfile[] {
  return normalizeRoles(user.profils, user.prof);
}

export function hasRole(user: Pick<Utilisateur, "prof" | "profils">, role: UserProfile): boolean {
  return rolesOf(user).includes(role);
}

export function withRoles<T extends Omit<Utilisateur, "prof" | "profils"> & Partial<Pick<Utilisateur, "prof" | "profils">>>(
  user: T,
  roles: readonly UserProfile[],
): T & Pick<Utilisateur, "prof" | "profils"> {
  const profils = normalizeRoles(roles, user.prof || "contrib");
  return { ...user, profils, prof: effectiveRole(profils) };
}

export function rolesToSharePoint(user: Pick<Utilisateur, "prof" | "profils">): string {
  return rolesOf(user).join(";");
}
