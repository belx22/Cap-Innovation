import { useEffect, useState, type ReactNode } from "react";
import type { Initiative, Jalon } from "../data/types";
import { useStore, closeValidationError } from "../state/store";
import { TODAY, d, days, iso } from "./dates";

/**
 * Logique partagée de clôture d'un jalon (date de fin réelle, écart, validation,
 * appel au store) — utilisée à la fois par JalonDrawer et par StepsDrawer, qui ont
 * chacun leur propre disposition (pied de tiroir vs bloc inline dans l'accordéon).
 */
export function useCloseStep(i: Initiative | null, j: Jalon | null, onClosed?: () => void) {
  const { closeJalon } = useStore();
  const [finDraft, setFinDraft] = useState(iso(TODAY));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFinDraft(iso(TODAY));
    setErr("");
  }, [j?.id]);

  const closed = j?.st === "valide";
  const ready = !!j && j.f.length > 0 && j.f.every((f) => f.ok);

  const gap: ReactNode = (() => {
    if (!j || !finDraft) return "";
    const g = days(d(j.due), d(finDraft));
    return g > 0 ? (
      <span className="chip h-late">{g} j de retard</span>
    ) : g < 0 ? (
      <span className="chip h-ok">{-g} j d'avance</span>
    ) : (
      <span className="chip h-ok">À la date prévue</span>
    );
  })();

  async function handleValidate() {
    if (!i || !j) return;
    const e = closeValidationError(i, j, finDraft);
    if (e) {
      setErr(e);
      return;
    }
    setSaving(true);
    const saved = await closeJalon(i.code, j.id, finDraft);
    setSaving(false);
    if (saved) {
      setErr("");
      onClosed?.();
    }
  }

  return { finDraft, setFinDraft, err, setErr, gap, ready, closed, saving, handleValidate };
}
