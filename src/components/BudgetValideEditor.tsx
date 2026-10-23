import { useState } from "react";
import { useStore } from "../state/store";
import { fmtM, fmtXAF } from "../lib/domain";
import type { Initiative } from "../data/types";

/** Édition du budget validé, soumise au circuit de validation (profil Directeur). */
export default function BudgetValideEditor({ i }: { i: Initiative }) {
  const { profile, requestBudgetChange } = useStore();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(i.bv || "");
  const canEdit = profile === "dir" && i.bvPend == null;

  if (editing) {
    return (
      <span className="r-edit">
        <input value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 120 }} />
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            requestBudgetChange(i, val.trim());
            setEditing(false);
          }}
        >
          Soumettre
        </button>
        <button type="button" className="btn-ghost sm" onClick={() => setEditing(false)}>
          Annuler
        </button>
      </span>
    );
  }

  return (
    <>
      {fmtM(i.bv)}
      {i.bvPend != null ? (
        <span className="hint" style={{ marginLeft: 8 }}>
          Modification en attente du Directeur : {fmtXAF(i.bvPend)}
        </span>
      ) : (
        canEdit && (
          <button
            type="button"
            className="linkish"
            style={{ marginLeft: 8 }}
            onClick={() => {
              setVal(i.bv || "");
              setEditing(true);
            }}
          >
            Modifier
          </button>
        )
      )}
    </>
  );
}
