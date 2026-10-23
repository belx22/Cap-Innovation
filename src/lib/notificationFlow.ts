import type { Notification } from "../data/types";

const NOTIFICATION_FLOW_URL = String(import.meta.env.VITE_NOTIFICATION_FLOW_URL || "").trim();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

/**
 * Déclenche le flux Power Automate déjà publié pour avertir la personne affectée.
 * L'URL signée reste une variable de déploiement et n'est jamais journalisée.
 */
export async function sendAssignmentEmail(notification: Notification): Promise<void> {
  if (notification.type !== "affectation" || !notification.recipientEmail.trim()) return;
  if (!NOTIFICATION_FLOW_URL) {
    throw new Error("VITE_NOTIFICATION_FLOW_URL n'est pas configurée");
  }

  const initiative = notification.initiativeCode ? ` — ${notification.initiativeCode}` : "";
  const response = await fetch(NOTIFICATION_FLOW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "affectation",
      destinataires: [{ email: notification.recipientEmail.trim(), nom: notification.recipientEmail.trim() }],
      sujet: `Nouvelle activité attribuée${initiative}`,
      corpsHtml: `<p>Bonjour,</p><p>${escapeHtml(notification.message)}</p><p>Connectez-vous à Cap Innovation pour consulter cette activité.</p>`,
      priorite: "normale",
      envoyerEmail: true,
      envoyerTeams: false,
      teamsChannelId: "",
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Flux de notification HTTP ${response.status}${details ? ` : ${details.slice(0, 180)}` : ""}`);
  }
}
