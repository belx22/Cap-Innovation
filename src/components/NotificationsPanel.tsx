import { useMemo } from "react";
import { useStore } from "../state/store";
import { fmt } from "../lib/dates";

export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { notifications, me, markNotificationRead } = useStore();
  const email = (me.email || "").trim().toLowerCase();
  const mine = useMemo(
    () => notifications.filter((n) => !email || n.recipientEmail.trim().toLowerCase() === email).sort((a, b) => b.at.localeCompare(a.at)),
    [notifications, email]
  );
  const unread = mine.filter((n) => !n.read);

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Notifications">
      <div className="d-head">
        <div>
          <span className="eyebrow">Centre d'information</span>
          <h2>Notifications</h2>
        </div>
        <button type="button" className="x" onClick={onClose} aria-label="Fermer">×</button>
      </div>
      <div className="d-body">
        <p className="sub">{unread.length} notification{unread.length > 1 ? "s" : ""} non lue{unread.length > 1 ? "s" : ""}</p>
        {!mine.length ? (
          <div className="empty">Aucune notification pour votre adresse Microsoft 365.</div>
        ) : (
          <div className="queue">
            {mine.map((n) => (
              <article key={n.id} className={`act${n.read ? "" : " unread"}`}>
                <span className="stripe" />
                <div>
                  <b>{n.message}</b>
                  <small>{n.at ? fmt(n.at) : "Date non renseignée"}{n.initiativeCode ? ` · ${n.initiativeCode}` : ""}</small>
                </div>
                {!n.read && <button type="button" className="btn-ghost sm" onClick={() => markNotificationRead(n.id)}>Marquer comme lu</button>}
                {n.read && <span className="chip c-ok">Lu</span>}
              </article>
            ))}
          </div>
        )}
        <p className="hint">La lecture est enregistrée dans SharePoint avec votre adresse Microsoft 365.</p>
      </div>
    </div>
  );
}
